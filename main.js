import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

//constants
const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const RESTITUTION = 0.6;
let BOX_SIZE = new THREE.Vector3(5, 5, 5);
const MEGA_BOX_SIZE = new THREE.Vector3(20, 20, 20);
const MEGA_SPHERES = 1000;

let boostField = null;   // will hold the booster
const BOOSTER_SIZE = 5;   // side length of booster cube 
const BOOSTER_ACCEL = 10;    // vertical acceleration inside booster

let timeScale = 1;
let windStrength = 0;    // default 0
let boxMode = false;

const OBJECTS = [];     
const puffParticles = [];   // for explosion “puffs”

let windVector = new THREE.Vector3(1, 0, 0); // initial wind direction +X
let scene, camera, renderer, controls;
let boxWalls = [];
let clock = new THREE.Clock();

// making the scene
init();
animate();

function init() {
  // Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(15, 10, 15);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Clamp camera
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2 - 0.11; // i thought that 0.11 looks good

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(-10, 12, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  const d = 30;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right =  d;
  dirLight.shadow.camera.top  =  d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  scene.add(dirLight);

  // Ground (thick box: 50×1×50 centered at y = –0.5)
  const groundGeo = new THREE.BoxGeometry(50, 1, 50);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -0.5, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // stars in the distance to look cool
  addStars();

  // Initial small box
  createBox(BOX_SIZE);

  // Spawn initial spheres
  spawnDefaultSpheres();

  // Set up UI
  setupUI();

  // Wind Dial
  setupWindDial();

  // Mouse click for explosions
  renderer.domElement.addEventListener("mousedown", onClick);

  // Handle window resize
  window.addEventListener("resize", onWindowResize);
}

// star background
function addStars() {
  const starGeo = new THREE.BufferGeometry();
  const starCnt = 2000;
  const positions = new Float32Array(starCnt * 3);
  for (let i = 0; i < starCnt; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 600;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 600;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    sizeAttenuation: true
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

// make a sphere
function addObject(type, position = randomSpawn()) {
  const size = 0.5; // radius
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.3,
    metalness: 0.7
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  sphere.position.copy(position);
  scene.add(sphere);

  OBJECTS.push({
    type,
    mesh: sphere,
    size,
    velocity: new THREE.Vector3()
  });
}

// spawning ball locations
function randomSpawn() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * 10,
    Math.random() * 5 + 5,
    (Math.random() - 0.5) * 10
  );
}

function randomSpawnInsideBox(boxSize) {
  const hx = boxSize.x / 2 - 0.5;
  const hy = boxSize.y / 2 - 0.5;
  const hz = boxSize.z / 2 - 0.5;
  return new THREE.Vector3(
    THREE.MathUtils.randFloat(-hx, hx),
    THREE.MathUtils.randFloat(0.5, boxSize.y - 0.5),
    THREE.MathUtils.randFloat(-hz, hz)
  );
}

// making a box
function createBox(boxSize) {
  removeBox();
  const halfW = boxSize.x / 2;
  const halfH = boxSize.y / 2;
  const halfD = boxSize.z / 2;

  // epsilon pushes the wall into the ground so we dont get ugly clipping artifacts
  const epsilon = -0.01;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.2,
    side: THREE.BackSide
  });

  // 1) Back wall (XY) at z = –halfD
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(boxSize.x, boxSize.y),
    mat
  );
  back.position.set(0, halfH + epsilon, -halfD + epsilon);
  scene.add(back);
  boxWalls.push(back);

  // 2) Front wall (XY) at z = +halfD
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(boxSize.x, boxSize.y),
    mat
  );
  front.position.set(0, halfH + epsilon, halfD - epsilon);
  front.rotateY(Math.PI);
  scene.add(front);
  boxWalls.push(front);

  // 3) Left wall (ZY) at x = –halfW
  const left = new THREE.Mesh(
    new THREE.PlaneGeometry(boxSize.z, boxSize.y),
    mat
  );
  left.position.set(-halfW + epsilon, halfH + epsilon, 0);
  left.rotateY(Math.PI / 2);
  scene.add(left);
  boxWalls.push(left);

  // 4) Right wall (ZY) at x = +halfW
  const right = new THREE.Mesh(
    new THREE.PlaneGeometry(boxSize.z, boxSize.y),
    mat
  );
  right.position.set(halfW - epsilon, halfH + epsilon, 0);
  right.rotateY(-Math.PI / 2);
  scene.add(right);
  boxWalls.push(right);

  // 5) Top (XZ) at y = +halfH
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(boxSize.x, boxSize.z),
    mat
  );
  top.position.set(0, halfH + epsilon, 0);
  top.rotateX(-Math.PI / 2);
  scene.add(top);
  boxWalls.push(top);

  BOX_SIZE.copy(boxSize);
  boxMode = true;
}

// delete box
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
  // first remove any existing booster
  removeBoosterField();

  // Build a transparent yellow cube of side BOOSTER_SIZE
  const geo = new THREE.BoxGeometry(BOOSTER_SIZE, BOOSTER_SIZE, BOOSTER_SIZE);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.3,
    roughness: 0.5,
    metalness: 0.2
  });
  boostField = new THREE.Mesh(geo, mat);
  boostField.position.set(0, BOOSTER_SIZE / 2, 0); // sit on the ground plane (y=0) so top at y=5
  boostField.receiveShadow = false;
  boostField.castShadow = false;
  scene.add(boostField);
}

// delete booster
function removeBoosterField() {
  if (boostField) {
    scene.remove(boostField);
    boostField.geometry.dispose();
    boostField.material.dispose();
    boostField = null;
  }
}

// smoke puff
function spawnPuff(pos) {
  const geo = new THREE.SphereGeometry(1.0, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
  });
  const puff = new THREE.Mesh(geo, mat);
  puff.position.copy(pos);
  scene.add(puff);
  puffParticles.push({ mesh: puff, life: 0 });
}

// main physics handler
function updatePhysics(delta) {
  const dynamics = OBJECTS.filter(o => o.type === "sphere");

  // add gravity and wind vectors
  dynamics.forEach(body => {
    // handle boost
    if (boostField) {
      // Check if the sphere’s center is within the booster’s AABB
      const pos = body.mesh.position;
      const half = BOOSTER_SIZE / 2;
      // boost is at (0, half, 0)
      if (pos.x > -half && pos.x < +half &&
        pos.z > -half && pos.z < +half &&
        pos.y - body.size < BOOSTER_SIZE) {
        body.velocity.y += (BOOSTER_ACCEL + 9.81) * delta;
      }
    }

    const acc = GRAVITY.clone().add(windVector.clone().multiplyScalar(windStrength));

    body.velocity.addScaledVector(acc, delta);
    body.mesh.position.addScaledVector(body.velocity, delta);

    // Ground collision and friction
    if (body.mesh.position.y < body.size) {
      body.mesh.position.y = body.size;
      if (body.velocity.y < 0) {
        body.velocity.y *= -RESTITUTION;
        body.velocity.x *= 0.99;
        body.velocity.z *= 0.99;
      }
    }

    // confinement if theres a box
    if (boxMode) {
      const halfW = BOX_SIZE.x / 2;
      const halfH = BOX_SIZE.y - body.size;
      const halfD = BOX_SIZE.z / 2;

      // X
      if (body.mesh.position.x > halfW - body.size) {
        body.mesh.position.x = halfW - body.size;
        body.velocity.x *= -RESTITUTION;
      } else if (body.mesh.position.x < -halfW + body.size) {
        body.mesh.position.x = -halfW + body.size;
        body.velocity.x *= -RESTITUTION;
      }
      // Y
      if (body.mesh.position.y > halfH) {
        body.mesh.position.y = halfH;
        body.velocity.y *= -RESTITUTION;
      }
      // Z
      if (body.mesh.position.z > halfD - body.size) {
        body.mesh.position.z = halfD - body.size;
        body.velocity.z *= -RESTITUTION;
      } else if (body.mesh.position.z < -halfD + body.size) {
        body.mesh.position.z = -halfD + body.size;
        body.velocity.z *= -RESTITUTION;
      }
    }
  });

  // sphere collision
  for (let i = 0; i < dynamics.length; i++) {
    for (let j = i + 1; j < dynamics.length; j++) {
      const A = dynamics[i];
      const B = dynamics[j];
      const deltaPos = new THREE.Vector3().subVectors(
        A.mesh.position, B.mesh.position
      );
      const dist = deltaPos.length();
      const radiusSum = A.size + B.size;
      if (dist < radiusSum && dist > 0.0001) {
        const normal = deltaPos.normalize();
        const penetration = radiusSum - dist;
        A.mesh.position.addScaledVector(normal, penetration / 2);
        B.mesh.position.addScaledVector(normal, -penetration / 2);

        const relVel = new THREE.Vector3().subVectors(A.velocity, B.velocity);
        const sepVel = relVel.dot(normal);
        if (sepVel < 0) {
          const impulse = -(1 + RESTITUTION) * sepVel / 2;
          A.velocity.addScaledVector(normal, impulse);
          B.velocity.addScaledVector(normal, -impulse);
        }
      }
    }
  }

  // puff animation
  for (let i = puffParticles.length - 1; i >= 0; i--) {
    const p = puffParticles[i];
    p.life += delta;
    p.mesh.scale.setScalar(1 + 2 * p.life);
    p.mesh.material.opacity = Math.max(0, 0.8 - p.life * 1.5);
    if (p.life > 0.6) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      puffParticles.splice(i, 1);
    }
  }
}

// mouse handlng
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onClick(event) {
  // Compute mouse coords
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // ignore except sphere meshes
  const sphereMeshes = OBJECTS.filter(o => o.type === "sphere").map(o => o.mesh);
  const intersects = raycaster.intersectObjects(sphereMeshes, false);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const idx = OBJECTS.findIndex(o => o.mesh === hitMesh);
    if (idx !== -1) {
      const body = OBJECTS[idx];
      spawnPuff(body.mesh.position.clone());

      // Impulse to nearby spheres
      OBJECTS.forEach(o => {
        if (o.type !== "sphere" || o.mesh === body.mesh) return;
        const d = o.mesh.position.distanceTo(body.mesh.position);
        if (d < 5 && d > 0.001) {
          const dir = new THREE.Vector3().subVectors(
            o.mesh.position, body.mesh.position
          ).normalize();
          const strength = 15 * (1 - d / 5);
          o.velocity.addScaledVector(dir, strength);
        }
      });

      // Remove clicked sphere
      scene.remove(body.mesh);
      body.mesh.geometry.dispose();
      body.mesh.material.dispose();
      OBJECTS.splice(idx, 1);
    }
  }
}

// animation loop
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta() * timeScale;
  updatePhysics(dt);
  controls.update();
  renderer.render(scene, camera);
}

// spawn 3 spheres
function spawnDefaultSpheres() {
  // Remove existing spheres
  OBJECTS.forEach(o => scene.remove(o.mesh));
  OBJECTS.length = 0;

  // Spawn three default spheres (outside box)
  addObject("sphere");
  addObject("sphere");
  addObject("sphere");
}

// ui handling
function setupUI() {
  document.getElementById("timeScale").oninput = e => {
    timeScale = parseFloat(e.target.value);
    document.getElementById("timeScaleLabel").textContent =
      timeScale.toFixed(1) + "×";
  };

  document.getElementById("wind").oninput = e => {
    windStrength = parseFloat(e.target.value);
    document.getElementById("windLabel").textContent =
      windStrength.toFixed(1);
  };

  // Add Sphere button
  document.getElementById("spawnSphere").onclick = () => addObject("sphere");

    // Small Box (5×5×5)
    document.getElementById("enableBox").onclick = () => {
    createBox(new THREE.Vector3(5, 5, 5));
    removeBoosterField();           
    spawnDefaultSpheres();
    };

  // No Box
    document.getElementById("disableBox").onclick = () => {
    removeBox();
    removeBoosterField();        
    spawnDefaultSpheres();
    };

  // Large Box
    document.getElementById("megaBox").onclick = () => {
    createBox(new THREE.Vector3(20, 20, 20));
    // Clear existing spheres
    OBJECTS.forEach(o => scene.remove(o.mesh));
    OBJECTS.length = 0;
    // Spawn 1000 inside box
    for (let i = 0; i < MEGA_SPHERES; i++) {
        const pos = randomSpawnInsideBox(BOX_SIZE);
        addObject("sphere", pos);
    }
    createBoosterField();         
    };
}

function setupWindDial() {
  const dial = document.getElementById("windDial");
  const ctx = dial.getContext("2d");

  function drawDial(angle) {
    ctx.clearRect(0, 0, 80, 80);
    ctx.beginPath();
    ctx.arc(40, 40, 38, 0, 2 * Math.PI);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    const armX = 40 + 36 * Math.cos(angle);
    const armY = 40 + 36 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(armX, armY);
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  drawDial(0); 

  dial.addEventListener("mousedown", e => {
    function updateAngle(evt) {
      const rect = dial.getBoundingClientRect();
      const dx = evt.clientX - rect.left - 40;
      const dy = evt.clientY - rect.top - 40;
      const angle = Math.atan2(dy, dx);
      windVector.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
      drawDial(angle);
    }

    updateAngle(e);

    function stop() {
      window.removeEventListener("mousemove", updateAngle);
      window.removeEventListener("mouseup", stop);
    }

    window.addEventListener("mousemove", updateAngle);
    window.addEventListener("mouseup", stop);
  });
}

// in case window is resized
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
