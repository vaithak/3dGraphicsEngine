class SoftEngine {
    constructor() {
        this.wireframe = 0;
        this.rastered  = 0;
        this.shaded    = 0;
        this.textured  = 1;
    }
}

SoftEngine.Camera = class {
    constructor() {
        this.Position = BABYLON.Vector3.Zero();
        this.Target   = BABYLON.Vector3.Zero();
        this.Up       = BABYLON.Vector3.Up();
    }
}

SoftEngine.Mesh = class {
    constructor(name, verticesCount, facesCount) {
        this.name         = name;
        this.Vertices     = new Array(verticesCount);
        this.Faces        = new Array(facesCount);
        this.Rotation     = BABYLON.Vector3.Zero();
        this.Position     = BABYLON.Vector3.Zero();
        this.Texture      = null;
        this.RasterColors = new Array(facesCount);
    }
}
class Texture{
    // Working with a fix sized texture (512x512, 1024x1024, etc.).
    constructor (filename, width, height) {
        this.width = width;
        this.height = height;
        this.internalBuffer = null;
        this.load("./data/" + filename);
    }

    load (filename) {
        let _this = this;
        let imageTexture = new Image();
        imageTexture.height = this.height;
        imageTexture.width = this.width;
        imageTexture.onload = function () {
            let internalCanvas = document.createElement("canvas");
            internalCanvas.width = _this.width;
            internalCanvas.height = _this.height;
            let internalContext = internalCanvas.getContext("2d");
            internalContext.drawImage(imageTexture, 0, 0);
            _this.internalBuffer = internalContext.getImageData(0, 0, _this.width, _this.height);
        };
        imageTexture.src = filename;
    }

    // Takes the U & V coordinates exported by Blender
    // and return the corresponding pixel color in the texture
    map (tu, tv) {
        if (this.internalBuffer) { 
            // using a % operator to cycle/repeat the texture if needed
            let u = Math.abs(((tu * this.width) % this.width)) >> 0;
            let v = Math.abs(((tv * this.height) % this.height)) >> 0;

            let pos = (u + v * this.width) * 4;

            let r = this.internalBuffer.data[pos];
            let g = this.internalBuffer.data[pos + 1];
            let b = this.internalBuffer.data[pos + 2];
            let a = this.internalBuffer.data[pos + 3];

            return new BABYLON.Color4(r / 255.0, g / 255.0, b / 255.0, a / 255.0);
        }
        // Image is not loaded yet
        else {
            return new BABYLON.Color4(1, 1, 1, 1);
        }
    };
}

SoftEngine.Device = class {
    constructor(canvas) {
        this.workingCanvas  = canvas;
        this.workingWidth   = canvas.width;
        this.workingHeight  = canvas.height;
        this.workingContext = this.workingCanvas.getContext("2d");
        this.depthbuffer = new Array(this.workingWidth * this.workingHeight);
    }

    LoadJSONFile(filename, callback) {
        let currObj = this;
        $.getJSON( filename, function(data) {
            callback(currObj.createMeshes(data))
        });
    }

    // Specific to the file format generated by Babylon.js
    createMeshes(jsonObject) {
        let meshes = [];
        let materials = [];

        // Filling all materials
        for (var materialIndex = 0; materialIndex < jsonObject.materials.length; materialIndex++) {
            let material = {};

            material.Name = jsonObject.materials[materialIndex].name;
            material.ID = jsonObject.materials[materialIndex].id;
            if (jsonObject.materials[materialIndex].diffuseTexture)
                material.DiffuseTextureName = jsonObject.materials[materialIndex].diffuseTexture.name;

            materials[material.ID] = material;
        }

        for(let meshIndex = 0; meshIndex < jsonObject.meshes.length; meshIndex++) {
            let verticesArray = (jsonObject.meshes[meshIndex].vertices) || (jsonObject.meshes[meshIndex].positions);
            // Faces
            let indicesArray = jsonObject.meshes[meshIndex].indices;

            let uvCount = jsonObject.meshes[meshIndex].uvCount;
            let verticesStep = 1;

            // Depending of the number of texture's coordinates per vertex
            // we're jumping in the vertices array  by 6, 8 & 10 windows frame
            switch(uvCount) {
                case 0:
                    verticesStep = 6;
                    break;
                case 1:
                    verticesStep = 8;
                    break;
                case 2:
                    verticesStep = 10;
                    break;
            }

            // the number of interesting vertices information for us
            let verticesCount = verticesArray.length / verticesStep;
            // number of faces is logically the size of the array divided by 3 (A, B, C)
            let facesCount = indicesArray.length / 3;
            let mesh = new SoftEngine.Mesh(jsonObject.meshes[meshIndex].name, verticesCount, facesCount);

            // Filling the Vertices array of our mesh first
            for (let index = 0; index < verticesCount; index++) {
                let x = verticesArray[index * verticesStep];
                let y = verticesArray[index * verticesStep + 1];
                let z = verticesArray[index * verticesStep + 2];
                
                // Loading the vertex normal exported by Blender
                let nx = verticesArray[index * verticesStep + 3];
                let ny = verticesArray[index * verticesStep + 4];
                let nz = verticesArray[index * verticesStep + 5];

                // Loading the texture coordinates
                if (uvCount > 0) {
                    var u = verticesArray[index * verticesStep + 6];
                    var v = verticesArray[index * verticesStep + 7];
                    mesh.Vertices[index] = {
                        Coordinates: new BABYLON.Vector3(x, y, z),
                        Normal: new BABYLON.Vector3(nx, ny, nz),
                        WorldCoordinates: null,
                        TextureCoordinates: new BABYLON.Vector2(u, v) 
                    };
                }
                else {
                    mesh.Vertices[index] = {
                        Coordinates: new BABYLON.Vector3(x, y, z),
                        Normal: new BABYLON.Vector3(nx, ny, nz),
                        WorldCoordinates: null,
                        TextureCoordinates: new BABYLON.Vector2(0, 0)
                    };
                }
            }

            // Then filling the Faces array
            for(let index = 0; index < facesCount; index++) {
                let a = indicesArray[index * 3];
                let b = indicesArray[index * 3 + 1];
                let c = indicesArray[index * 3 + 2];
                mesh.Faces[index] = {
                    A: a,
                    B: b,
                    C: c
                };
            }

            // Getting the position you've set in Blender
            let position = jsonObject.meshes[meshIndex].position;
            mesh.Position = new BABYLON.Vector3(position[0], position[1], position[2]);

            if (uvCount > 0) {
                let meshTextureID = jsonObject.meshes[meshIndex].materialId;
                let meshTextureName = materials[meshTextureID].DiffuseTextureName;
                mesh.Texture = new Texture(meshTextureName, 512, 512);
            }

            meshes.push(mesh);
        }
        return meshes;
    }

    clear() {
        // Note: the back buffer size is equal to the number of pixels to draw
        // on screen (width*height) * 4 (R,G,B & Alpha values). 
        // Clearing with black color by default
        this.workingContext.clearRect(0, 0, this.workingWidth, this.workingHeight);
        this.backbuffer = this.workingContext.getImageData(0, 0, this.workingWidth, this.workingHeight);

        // Clearing depth buffer
        for (let i = 0; i < this.depthbuffer.length; i++) {
            // Max possible value 
            this.depthbuffer[i] = 10000000;
        }
    }

    // Once everything is ready, we can flush the back buffer into the front buffer. 
    present () {
        this.workingContext.putImageData(this.backbuffer, 0, 0);
    }

    // Called to put a pixel on screen at a specific X,Y coordinates
    // point is of type Vector3 as point.z is used for Depth Buffer
    drawPoint(point, color) {
        // Clipping what's visible on screen
        if (point.x >= 0 && point.y >= 0 && point.x < this.workingWidth && point.y < this.workingHeight) {
            let x = point.x;
            let y = point.y;
            let z = point.z;
            let index = ((x >> 0) + (y >> 0) * this.workingWidth);

            // Discard if behind an already painted object
            if(this.depthbuffer[index] < z) {
                return;
            }
        
            this.depthbuffer[index] = z;
            this.backbuffer.data[4*index] = color.r * 255;
            this.backbuffer.data[4*index + 1] = color.g * 255;
            this.backbuffer.data[4*index + 2] = color.b * 255;
            this.backbuffer.data[4*index + 3] = color.a * 255;
        }
    }

    // Draw Line between 2 points using breshnam's Algorithm
    breshnamDrawLine (point0, point1) {
        let x0 = point0.x >> 0;
        let y0 = point0.y >> 0;
        let x1 = point1.x >> 0;
        let y1 = point1.y >> 0;
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let color = new BABYLON.Color4(1,1,0,1);

        if(dy > dx){
            let sx = (x0 < x1) ? 1 : -1;
            let sy = (y0 < y1) ? 1 : -1;
            let err = dx - dy;

            for(let y=y0; y!=y1; y=y+sy){
                this.drawPoint(new BABYLON.Vector2(x0, y), color);
                if(err >= 0) {
                    x0 += sx ;
                    err -= dy;
                }
                err += dx;
            }
        }
        else{
            let sx = (x0 < x1) ? 1 : -1;
            let sy = (y0 < y1) ? 1 : -1;
            let err = dy - dx;

            for(let x=x0; x!=x1; x=x+sx){
                this.drawPoint(new BABYLON.Vector2(x, y0), color);
                if(err >= 0) {
                    y0 += sy ;
                    err -= dx;
                }
                err += dy;
            }
        }
    }

    // projectPointOnScreen takes a vertex and returns the transformed vertex
    projectPointOnScreen (coord, transMat, world) {
        let point = BABYLON.Vector3.TransformCoordinates(coord.Coordinates, transMat);
        
        // transforming the coordinates & the normal to the vertex in the 3D world
        let point3DWorld = BABYLON.Vector3.TransformCoordinates(coord.Coordinates, world);
        let normal3DWorld = BABYLON.Vector3.TransformCoordinates(coord.Normal, world);

        // The transformed coordinates will be based on coordinate system
        // starting on the center of the screen. But drawing on screen normally starts
        // from top left. We then need to transform them again to have x:0, y:0 on top left.
        // As they are currently inside a [-1,1] cube on all axes.
        let x = point.x * this.workingWidth + this.workingWidth / 2.0 ;
        let y = -point.y * this.workingHeight + this.workingHeight / 2.0;

        // Z-cordinate is for z-buffer
        return ({
            Coordinates: new BABYLON.Vector3(x, y, point3DWorld.z),
            Normal: normal3DWorld,
            WorldCoordinates: point3DWorld,
            TextureCoordinates: coord.TextureCoordinates
        });
    }

    clamp (value, min, max) {
        if (typeof min === "undefined") { min = 0; }
        if (typeof max === "undefined") { max = 1; }
        return Math.max(min, Math.min(value, max));
    }

    // Compute the cosine of the angle between the light vector and the normal vector
    computeNDotL (vertex, normal, lightPosition) {
        let lightDirection = lightPosition.subtract(vertex);
        normal.normalize();
        lightDirection.normalize();
        return Math.max(0, BABYLON.Vector3.Dot(normal, lightDirection));
    }

    // Linearly Interpolating
    linInterpolate (min, max, gradient) {
        let t = this.clamp(gradient);
        return (1-t)*min + t*max;
    };

    // Rasterization of Triangles using Scanline conversion
    processScanLine (data, pa, pb, pc, pd, color, boolShaded, texture) {
        let gradient1 = pa.y != pb.y ? (data.currentY - pa.y) / (pb.y - pa.y) : 1;
        let gradient2 = pc.y != pd.y ? (data.currentY - pc.y) / (pd.y - pc.y) : 1;
    
        // Finding X Coordinates by interpolation
        let sx = this.linInterpolate(pa.x, pb.x, gradient1) >> 0;
        let ex = this.linInterpolate(pc.x, pd.x, gradient2) >> 0;

        // starting Z & ending Z by interpolation
        let z1 = this.linInterpolate(pa.z, pb.z, gradient1);
        let z2 = this.linInterpolate(pc.z, pd.z, gradient2);

        // Finding starting and ending intensity by interpolation
        let snl = this.linInterpolate(data.ndotla, data.ndotlb, gradient1);
        let enl = this.linInterpolate(data.ndotlc, data.ndotld, gradient2);

        // Finding Starting and Ending Texture Coordinates
        let su = this.linInterpolate(data.ua, data.ub, gradient1);
        let eu = this.linInterpolate(data.uc, data.ud, gradient2);
        let sv = this.linInterpolate(data.va, data.vb, gradient1);
        let ev = this.linInterpolate(data.vc, data.vd, gradient2);
    
        // drawing a line from left (sx) to right (ex) 
        for(let x = sx; x < ex; x++) {
            let currGradient = (x - sx) / (ex - sx);
            let z        = this.linInterpolate(z1, z2, currGradient);
            let ndotl    = this.linInterpolate(snl, enl, currGradient);

            // FOR TEXTURING
            let currU = this.linInterpolate(su, eu, currGradient);
            let currV = this.linInterpolate(sv, ev, currGradient);

            let textureColor;
            if (texture != null ) {
                textureColor = texture.map(currU, currV);
            }
            else{
                textureColor = new BABYLON.Color4(1, 1, 1, 1);
            }        

            if(!boolShaded){
                ndotl = 1;
            }
            this.drawPoint(new BABYLON.Vector3(x, data.currentY, z), new BABYLON.Color4(color.r * ndotl * textureColor.r, color.g * ndotl * textureColor.g, color.b * ndotl * textureColor.b, 1));
        }
    }

    drawTriangle (v1, v2, v3, color, lightPos, boolShaded, texture) {
        // Sorting the points in order to always have this order on screen p1, p2 & p3
        // with p1 always up (thus having the Y the lowest possible to be near the top screen)
        // then p2 between p1 & p3
        if (v1.Coordinates.y > v2.Coordinates.y) {
            let temp = v2;
            v2 = v1;
            v1 = temp;
        }

        if (v2.Coordinates.y > v3.Coordinates.y) {
            let temp = v2;
            v2 = v3;
            v3 = temp;
        }

        if (v1.Coordinates.y > v2.Coordinates.y) {
            let temp = v2;
            v2 = v1;
            v1 = temp;
        }

        let p1 = v1.Coordinates;
        let p2 = v2.Coordinates;
        let p3 = v3.Coordinates;
    
        // computing the cos of the angle between the light vector and the normal vector 
        // that will be used as the intensity of the color        
        let ndotl1 = this.computeNDotL(v1.WorldCoordinates, v1.Normal, lightPos);
        let ndotl2 = this.computeNDotL(v2.WorldCoordinates, v2.Normal, lightPos);
        let ndotl3 = this.computeNDotL(v3.WorldCoordinates, v3.Normal, lightPos);

        let data = {};

        // Computing slopes
        let invSlopeP1P2, invSlopeP1P3;
        if(p2.y > p1.y) {
            invSlopeP1P2 = (p2.x - p1.x) / (p2.y - p1.y);
        } else {
            // For easy calculation
            invSlopeP1P2 = 0;
        }
    
        if(p3.y - p1.y > 0) {
            invSlopeP1P3 = (p3.x - p1.x) / (p3.y - p1.y);
        } else {
            // For easy calculation
            invSlopeP1P3 = 0;
        }
    
        // Case where triangles are like that:
        // P1
        // -
        // -- 
        // - -
        // -  -
        // -   - P2
        // -  -
        // - -
        // -
        // P3
        if(invSlopeP1P2 > invSlopeP1P3) {
            for(let y = p1.y >> 0; y <= p3.y >> 0; y++) {
                data.currentY = y;
                if(y < p2.y) {
                    data.ndotla = ndotl1;
                    data.ndotlb = ndotl3;
                    data.ndotlc = ndotl1;
                    data.ndotld = ndotl2;

                    data.ua = v1.TextureCoordinates.x;
                    data.ub = v3.TextureCoordinates.x;
                    data.uc = v1.TextureCoordinates.x;
                    data.ud = v2.TextureCoordinates.x;

                    data.va = v1.TextureCoordinates.y;
                    data.vb = v3.TextureCoordinates.y;
                    data.vc = v1.TextureCoordinates.y;
                    data.vd = v2.TextureCoordinates.y;

                    this.processScanLine(data, p1, p3, p1, p2, color, boolShaded, texture);
                } else {
                    data.ndotla = ndotl1;
                    data.ndotlb = ndotl3;
                    data.ndotlc = ndotl2;
                    data.ndotld = ndotl3;

                    data.ua = v1.TextureCoordinates.x;
                    data.ub = v3.TextureCoordinates.x;
                    data.uc = v2.TextureCoordinates.x;
                    data.ud = v3.TextureCoordinates.x;

                    data.va = v1.TextureCoordinates.y;
                    data.vb = v3.TextureCoordinates.y;
                    data.vc = v2.TextureCoordinates.y;
                    data.vd = v3.TextureCoordinates.y;

                    this.processScanLine(data, p1, p3, p2, p3, color, boolShaded, texture);
                }
            }
        }
        // Case where triangles are like that:
        //       P1
        //        -
        //       -- 
        //      - -
        //     -  -
        // P2 -   - 
        //     -  -
        //      - -
        //        -
        //       P3
        else {
            for(let y = p1.y >> 0; y <= p3.y >> 0; y++) {
                data.currentY = y;
                if(y < p2.y) {
                    data.ndotla = ndotl1;
                    data.ndotlb = ndotl2;
                    data.ndotlc = ndotl1;
                    data.ndotld = ndotl3;

                    data.ua = v1.TextureCoordinates.x;
                    data.ub = v2.TextureCoordinates.x;
                    data.uc = v1.TextureCoordinates.x;
                    data.ud = v3.TextureCoordinates.x;

                    data.va = v1.TextureCoordinates.y;
                    data.vb = v2.TextureCoordinates.y;
                    data.vc = v1.TextureCoordinates.y;
                    data.vd = v3.TextureCoordinates.y;

                    this.processScanLine(data, p1, p2, p1, p3, color, boolShaded, texture);
                } else {
                    data.ndotla = ndotl2;
                    data.ndotlb = ndotl3;
                    data.ndotlc = ndotl1;
                    data.ndotld = ndotl3;

                    data.ua = v2.TextureCoordinates.x;
                    data.ub = v3.TextureCoordinates.x;
                    data.uc = v1.TextureCoordinates.x;
                    data.ud = v3.TextureCoordinates.x;

                    data.va = v2.TextureCoordinates.y;
                    data.vb = v3.TextureCoordinates.y;
                    data.vc = v1.TextureCoordinates.y;
                    data.vd = v3.TextureCoordinates.y;

                    this.processScanLine(data, p2, p3, p1, p3, color, boolShaded, texture);
                }
            }
        }
    }

    // The main method of the engine that re-compute each vertex projection during each frame
    render (camera, meshes, engine, lightPos) {
        // To understand this part, please read the prerequisites resources
        let viewMatrix = BABYLON.Matrix.LookAtLH(camera.Position, camera.Target, camera.Up);
        let projectionMatrix = BABYLON.Matrix.PerspectiveFovLH(0.78, this.workingWidth / this.workingHeight, 0.01, 1.0);

        meshes.forEach((cMesh) => {
            // Calculating Transformation Matrix
            let worldMatrix = BABYLON.Matrix.RotationYawPitchRoll(cMesh.Rotation.y, cMesh.Rotation.x, cMesh.Rotation.z)
                                .multiply(BABYLON.Matrix.Translation(cMesh.Position.x, cMesh.Position.y, cMesh.Position.z));

            let transformMatrix = worldMatrix.multiply(viewMatrix).multiply(projectionMatrix);

            // for (let i = 0; i < cMesh.Vertices.length -1; i++){
            //     let point0 = this.projectPointOnScreen(cMesh.Vertices[i], transformMatrix);
            //     let point1 = this.projectPointOnScreen(cMesh.Vertices[i + 1], transformMatrix);
            //     this.breshnamDrawLine(point0, point1);
            // }

            cMesh.Faces.forEach((currentFace, indexFaces) => {
                let vertexA = cMesh.Vertices[currentFace.A];
                let vertexB = cMesh.Vertices[currentFace.B];
                let vertexC = cMesh.Vertices[currentFace.C];

                let pointA = this.projectPointOnScreen(vertexA, transformMatrix, worldMatrix);
                let pointB = this.projectPointOnScreen(vertexB, transformMatrix, worldMatrix);
                let pointC = this.projectPointOnScreen(vertexC, transformMatrix, worldMatrix);

                // FOR WIREFRAME RENDERING
                if (engine.wireframe == 1){
                    this.breshnamDrawLine(pointA.Coordinates, pointB.Coordinates);
                    this.breshnamDrawLine(pointB.Coordinates, pointC.Coordinates);
                    this.breshnamDrawLine(pointC.Coordinates, pointA.Coordinates);
                }
                // FOR TRIANGLE RASTERIZATION
                else if (engine.rastered == 1){
                    if(cMesh.RasterColors[indexFaces] == null){
                        cMesh.RasterColors[indexFaces] = 0.30*Math.random() + 0.70;
                    }
                    let color = cMesh.RasterColors[indexFaces];
                    this.drawTriangle(pointA, pointB, pointC, new BABYLON.Color4(color, color, color, 1), lightPos, 0, null);
                }
                // FOR GOURAD SHADING
                else if (engine.shaded == 1){
                    let color = 1.0;
                    this.drawTriangle(pointA, pointB, pointC, new BABYLON.Color4(color, color, color, 1), lightPos, 1, null);
                }
                // FOR TEXTURING
                else {
                    let color = 1.0;
                    this.drawTriangle(pointA, pointB, pointC, new BABYLON.Color4(color, color, color, 1), lightPos, 1, cMesh.Texture);
                }
            });
        });
    }
}