import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";

//constants
const spheres = []; 
const gravity_vector = new THREE.Vector3(0, -9.81, 0);
const restitution = 0.6;     
const puffParticles = []; //for explosion puffs
let boxWalls = [];
let boxMode = false;
let currBoxSize = new THREE.Vector3(5, 5, 5);
let windVector = new THREE.Vector3(1, 0, 0); //initial wind direction going in x
let windStrength = 0;  //default 0
let boostField = null;   //will hold the booster
const boosterSize = 5;   //side length of booster cube 

let timeScale = 1;
let scene, cam, r, controls;
let clock = new THREE.Clock();

//making the scene 
init();
animate();
 
function init() {
    //camera setup and scene setup 
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    cam = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    cam.position.set(15, 10, 15);
    cam.lookAt(0, 0, 0);

    //renderer
    r = new THREE.WebGLRenderer({antialias: true});
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    document.body.appendChild(r.domElement);
    controls = new OrbitControls(cam, r.domElement);
    controls.enableDamping = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI/2-0.11; //i thought that 0.11 looks good and 
    //stops weird clipping issue

    //ambient and directional lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(10, 10, 10);
    light.castShadow = true;
    light.shadow.mapSize.width = 1000;
    light.shadow.mapSize.height = 1000;
    light.shadow.camera.left = -30;
    light.shadow.camera.right = 30;
    light.shadow.camera.top = 30;
    light.shadow.camera.bottom = -30;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 100;
    scene.add(light);

    //ground box
    const ground = new THREE.Mesh(new THREE.BoxGeometry(50, 1, 50), new THREE.MeshStandardMaterial({color: 0x444444}));
    ground.position.set(0, -0.5, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    //stars in the distance to look cool
    addStars();

    //start with small box
    createBox(currBoxSize);

    //3 spheres
    spawnThreeSpheres();

    //set up ui
    setupUI();

    //make wind dial
    setupWindDial();

    //explosions
    r.domElement.addEventListener("mousedown", onClick);

    //handle  resizing
    window.addEventListener("resize", onWindowResize);
}

//star background
function addStars() {
    const starGeometry = new THREE.BufferGeometry();
    const count = 2000;
    const pos = new Float32Array(count*3);
    for (let i = 0; i < count; i++) { //random locations in space
        pos[i*3] = (Math.random()-0.5)*600;
        pos[i*3+1] = (Math.random()-0.5)*600;
        pos[i*3+2] = (Math.random()-0.5)*600;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({color: 0xffffff, size: 1})));
}

//make a sphere
function addSphere(position = randomSpawn()) {
    const size = 0.5; //radius
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshStandardMaterial({color: 0xFF0000, roughness: 0.45, metalness: 0.7}));
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.copy(position);
    scene.add(sphere);

    spheres.push({mesh: sphere, size, velocity: new THREE.Vector3()});
}

//spawn 3 spheres
function spawnThreeSpheres() {
    //remove all spheres
    spheres.forEach(s => scene.remove(s.mesh));
    spheres.length = 0;

    //spawn three spheres
    addSphere();
    addSphere();
    addSphere();
}

//spawning ball locations
function randomSpawn() {
    return new THREE.Vector3((Math.random()-0.5)*10, Math.random()*5+5, (Math.random()-0.5)*10); //random locations
}

function randomSpawnInsideBox(boxSize) {
    const x = boxSize.x / 2 - 0.5; //-0.5 so you make sure its inside the box
    const z = boxSize.z / 2 - 0.5;
    return new THREE.Vector3(THREE.MathUtils.randFloat(-x, x), THREE.MathUtils.randFloat(0.5, boxSize.y - 0.5), THREE.MathUtils.randFloat(-z, z));
}

//making a box
function createBox(boxSize) {
    removeBox();
    //offset  pushes the wall into the ground so we dont get ugly clipping artifacts
    const offset = -0.01;
    const wallMaterial = new THREE.MeshStandardMaterial({color: 0x888888, transparent: true, opacity: 0.2, side: THREE.DoubleSide});

    //back
    const back = new THREE.Mesh(new THREE.PlaneGeometry(boxSize.x, boxSize.y), wallMaterial);
    back.position.set(0, (boxSize.y/2)+offset, -(boxSize.z/2)+offset);
    scene.add(back);
    boxWalls.push(back);

    //front
    const front = new THREE.Mesh(new THREE.PlaneGeometry(boxSize.x, boxSize.y), wallMaterial);
    front.position.set(0, (boxSize.y/2)+offset, (boxSize.z/2)-offset);
    front.rotateY(Math.PI);
    scene.add(front);
    boxWalls.push(front);

    //left
    const left = new THREE.Mesh(new THREE.PlaneGeometry(boxSize.z, boxSize.y), wallMaterial);
    left.position.set(-(boxSize.x/2)+offset, (boxSize.y/2)+offset, 0);
    left.rotateY(Math.PI/2);
    scene.add(left);
    boxWalls.push(left);

    //right
    const right = new THREE.Mesh(new THREE.PlaneGeometry(boxSize.z, boxSize.y), wallMaterial);
    right.position.set((boxSize.x/2)-offset, (boxSize.y/2)+offset, 0);
    right.rotateY(-Math.PI/2);
    scene.add(right);
    boxWalls.push(right);

    //top
    const top = new THREE.Mesh(new THREE.PlaneGeometry(boxSize.x, boxSize.z), wallMaterial);
    top.position.set(0, (boxSize.y/2)*2+offset, 0);
    top.rotateX(-Math.PI/2);
    scene.add(top);
    boxWalls.push(top);

    currBoxSize.copy(boxSize);
    boxMode = true;

    //dont need bottom because the ground is there already
}

//delete box
function removeBox() {
    for (let w of boxWalls) {
        scene.remove(w);
        w.geometry.dispose();
        w.material.dispose();
    }
    boxWalls = [];
    boxMode = false;
}

function createBoosterField() {
    //make transparent yellow cube
    boostField = new THREE.Mesh(new THREE.BoxGeometry(boosterSize, boosterSize, boosterSize), new THREE.MeshStandardMaterial({color: 0xffff00, transparent: true, opacity: 0.3, roughness: 0.5, metalness: 0.2}));
    boostField.position.set(0, boosterSize/2, 0); //sit on the ground
    boostField.receiveShadow = false;
    boostField.castShadow = false; //turn off shadows because its transparent
    scene.add(boostField);
}

//delete booster
function removeBoosterField() {
    if (boostField) {
        scene.remove(boostField);
        boostField.geometry.dispose();
        boostField.material.dispose();
        boostField = null;
    }
}

//smoke puff
function spawnPuff(pos) { //make a sphere thats size and opacity depends on how long its existed
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 50, 50), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.8}));
    puff.position.copy(pos);
    scene.add(puff);
    puffParticles.push({mesh: puff, life: 0});
}

//main physics handler
function updatePhysics(timeChange) {
    spheres.forEach(s => {
        //handle boosting velocity adding
        if (boostField) {
            const pos = s.mesh.position;
            if (pos.x > -(boosterSize/2) && pos.x < (boosterSize/2) &&
                pos.z > -(boosterSize/2) && pos.z < (boosterSize/2) &&
                pos.y-s.size < boosterSize) { //if sphere center is inside
                    s.velocity.y += 20*timeChange; //needs to be large to overcome -9.81 grav
            }
        }
        //add gravity and wind vectors and scale their effects by the timespeed
        //add accel to velocity, and add velocity to position
        s.velocity.addScaledVector(gravity_vector.clone().add(windVector.clone().multiplyScalar(windStrength)), timeChange);
        s.mesh.position.addScaledVector(s.velocity, timeChange);

        //ground collision and friction
        if (s.mesh.position.y < s.size) {
            s.mesh.position.y = s.size;
            if (s.velocity.y < 0) {
                s.velocity.y *= -restitution; //bounce
                s.velocity.x *= 0.99;   //friction
                s.velocity.z *= 0.99;
            }
        }

        //keep objects inside a box if there is one
        if (boxMode) {
            //if its outside a wall, bounce it
            //for x
            if (s.mesh.position.x > (currBoxSize.x/2)-s.size) {
                s.mesh.position.x = (currBoxSize.x/2)-s.size;
                s.velocity.x *= -restitution;
            } else if (s.mesh.position.x < -(currBoxSize.x/2)+s.size) {
                s.mesh.position.x = -(currBoxSize.x/2)+s.size;
                s.velocity.x *= -restitution;
            }
            //for y
            //only need to do the ceiling cuz the ground already has bounce implemented earlier with collision
            if (s.mesh.position.y > (currBoxSize.y-s.size)) {
                s.mesh.position.y = (currBoxSize.y-s.size);
                s.velocity.y *= -restitution;
            }
            //for z
            if (s.mesh.position.z > (currBoxSize.z/2)-s.size) {
                s.mesh.position.z = (currBoxSize.z/2)-s.size;
                s.velocity.z *= -restitution;
            } else if (s.mesh.position.z < -(currBoxSize.z/2)+s.size) {
                s.mesh.position.z = -(currBoxSize.z/2)+s.size;
                s.velocity.z *= -restitution;
            }
        }
    });

    //sphere collision
    for (let i = 0; i < spheres.length; i++) {
        for (let j = i+1; j < spheres.length; j++) {
            const A = spheres[i];
            const B = spheres[j];
            //get how far the spheres are from each other
            const distanceVec = new THREE.Vector3().subVectors(A.mesh.position, B.mesh.position);
            const dist = distanceVec.length();
            //if they intersect, get how deep they intersected and move then away from eachother in the normal dir
            //normal direction means resolve easily and sensibly
            if (dist < (A.size+B.size) && dist > 0.0001) {
                const normal = distanceVec.normalize();
                const pen = (A.size+B.size)-dist;
                A.mesh.position.addScaledVector(normal, pen/2);
                B.mesh.position.addScaledVector(normal, -pen/2);
                //get how strong the separating vector should be
                const separatingVec = new THREE.Vector3().subVectors(A.velocity, B.velocity).dot(normal);
                if (separatingVec < 0) {
                    //add separating vector and scale it with restitution
                    const impulse = -(1+restitution)*separatingVec/2;
                    A.velocity.addScaledVector(normal, impulse);
                    B.velocity.addScaledVector(normal, -impulse);
                }
            }
        }
    }

    //puff animation
    for (let i = puffParticles.length-1; i >= 0; i--) {
        const p = puffParticles[i];
        p.life += timeChange;
        p.mesh.scale.setScalar(1+2*p.life); //larger with time
        p.mesh.material.opacity = Math.max(0, 0.8-p.life*3); //disappears slowly
        if (p.life > 0.6) { //remove it once it is old enough/disappeared
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            puffParticles.splice(i, 1);
        }
    }
}

//mouse handlng
const ray = new THREE.Raycaster();
const mousePlace = new THREE.Vector2();

function onClick(event) {
    //compute mouse coords
    mousePlace.x = (event.clientX/window.innerWidth)*2-1;
    mousePlace.y = -(event.clientY/window.innerHeight)*2+1;
    //make a ray to find which sphere was clicked if any
    ray.setFromCamera(mousePlace, cam);

    const intersections = ray.intersectObjects(spheres.map(s => s.mesh), false);

    if (intersections.length > 0) {//if something was clicked 
        const i = spheres.findIndex(s => s.mesh === intersections[0].object); //the first one is the clicked one
        if (i !== -1) {
            //create a puff
            spawnPuff(spheres[i].mesh.position.clone());

            //and impulse to nearby spheres
            spheres.forEach(s => {
                if (s.mesh === spheres[i].mesh) return; //skip self
                const dist = s.mesh.position.distanceTo(spheres[i].mesh.position);
                if (dist < 5 && dist > 0.001) { //dont impulse if its inside another sphere to avoid /0 issues
                    const dir = new THREE.Vector3().subVectors(s.mesh.position, spheres[i].mesh.position).normalize();
                    s.velocity.addScaledVector(dir, 15*(1-dist/5)); //scale the strength by how far they are
                }
            });

            //remove clicked sphere
            scene.remove(spheres[i].mesh);
            spheres[i].mesh.geometry.dispose();
            spheres[i].mesh.material.dispose();
            spheres.splice(i, 1);
        }
    }
}

//ui handling
function setupUI() {
    //add the time scale
    document.getElementById("timeScale").oninput = input => {
        timeScale = parseFloat(input.target.value);
        document.getElementById("timeScaleLabel").textContent = timeScale.toFixed(1) + "x";
    };
    //add the wind
    document.getElementById("wind").oninput = input => {
        windStrength = parseFloat(input.target.value);
        document.getElementById("windLabel").textContent = windStrength.toFixed(1);
    };

    //add sphere button
    document.getElementById("spawnSphere").onclick = () => addSphere();

    //small box button
    document.getElementById("enableBox").onclick = () => {
        createBox(new THREE.Vector3(5, 5, 5));
        removeBoosterField();           
        spawnThreeSpheres();
    };

    //no box button
    document.getElementById("disableBox").onclick = () => {
        removeBox();
        removeBoosterField();        
        spawnThreeSpheres();
    };

    //large box button
    document.getElementById("megaBox").onclick = () => {
        removeBoosterField();
        createBox(new THREE.Vector3(20, 20, 20));
        //delete all spheres
        spheres.forEach(s => scene.remove(s.mesh));
        spheres.length = 0;
        //spawn 1000 spheres
        for (let i = 0; i < 1000; i++) {
            addSphere(randomSpawnInsideBox(currBoxSize));
        }
        createBoosterField();         
    };
}

//wind dial
function setupWindDial() {
    const dial = document.getElementById("windDial");
    const c = dial.getContext("2d");

    function drawDial(angle) { 
        //bounding circle
        c.strokeStyle = "white";
        c.lineWidth = 2;
        c.clearRect(0, 0, 80, 80);
        c.beginPath();
        c.arc(40, 40, 40, 0, 2*Math.PI);
        c.stroke();
        //arm
        c.strokeStyle = "#00ffff";
        c.beginPath();
        c.moveTo(40, 40);
        c.lineTo(40+40*Math.cos(angle), 40+40*Math.sin(angle));
        c.stroke();
    }
    drawDial(0); 

    dial.addEventListener("mousedown", input => {
        function updateAngle(evt) {
            //get where you clicked and normalize it and set the vector to that direction in the xz plane
            const angle = Math.atan2(evt.clientY-dial.getBoundingClientRect().top-40, evt.clientX-dial.getBoundingClientRect().left-40); //get the angle
            windVector.set(Math.cos(angle), 0, Math.sin(angle)).normalize(); 
            drawDial(angle); //pass angle to drawDial
        }

        updateAngle(input);

        function stop() {
            window.removeEventListener("mousemove", updateAngle);
            window.removeEventListener("mouseup", stop);
        }

        window.addEventListener("mousemove", updateAngle);
        window.addEventListener("mouseup", stop);
    });
}

//in case window is resized
function onWindowResize() {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    r.setSize(window.innerWidth, window.innerHeight);
}

//main animation loop
function animate() {
    requestAnimationFrame(animate);
    updatePhysics(clock.getDelta() * timeScale); //handle timespeed
    controls.update();
    r.render(scene, cam);
}