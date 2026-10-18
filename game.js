
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const $ = (id) => document.getElementById(id);

const loadingScreen = $("loading-screen");
const progressBar = $("loading-progress");
const startMenu = $("start-menu");
const pauseMenu = $("pause-menu");
const pauseButton = $("pause-button");
const speedValue = $("speed-value");
const distanceValue = $("distance-value");
const bestSpeedValue = $("best-speed");
const centerMessage = $("center-message");

let scene, camera, renderer, car, wheels = [];
let roadSegments = [];
let ramps = [];
let clock;
let running = false;
let started = false;
let paused = false;
let distance = 0;
let speed = 0;
let bestSpeed = 0;
let steering = 0;
let carX = 0;
let verticalVelocity = 0;
let airborne = false;
let jumpTime = 0;
let shake = 0;
let engineAudio = null;
let engineOscillator = null;
let engineGain = null;
let audioStarted = false;

const keys = Object.create(null);
const touch = { left: false, right: false, accelerate: false, brake: false };

const config = {
  maxSpeed: 92,
  acceleration: 27,
  braking: 58,
  drag: 7,
  steeringSpeed: 2.1,
  roadWidth: 16,
  segmentLength: 90,
  segmentCount: 14
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function makeMaterial(color, roughness = 0.7, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function addBox(parent, name, size, material, position, rotation = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material
  );
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildCar() {
  const group = new THREE.Group();
  group.name = "Roadster";

  const bodyMaterial = makeMaterial(0xb90f28, 0.25, 0.8);
  const darkMaterial = makeMaterial(0x111820, 0.22, 0.45);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x071321,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.94,
    clearcoat: 1
  });
  const tireMaterial = makeMaterial(0x090b0e, 0.86);
  const rimMaterial = makeMaterial(0xaebbc9, 0.28, 0.9);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  const tailMaterial = new THREE.MeshBasicMaterial({
    color: 0xff142f,
    toneMapped: false
  });

  // Low, wide, fictional electric supercar body.
  addBox(group, "lower body", [2.12, 0.48, 4.45], bodyMaterial, [0, 0.64, 0]);
  addBox(group, "hood", [1.92, 0.16, 1.28], bodyMaterial, [0, 0.91, -1.32]);
  addBox(group, "rear deck", [1.84, 0.18, 0.92], bodyMaterial, [0, 0.91, 1.52]);

  const cabin = addBox(
    group,
    "glass cabin",
    [1.55, 0.62, 1.82],
    glassMaterial,
    [0, 1.15, 0.05],
    [-0.04, 0, 0]
  );
  cabin.scale.set(1, 1, 1);

  addBox(group, "roof", [1.48, 0.12, 1.05], darkMaterial, [0, 1.49, 0.03]);
  addBox(group, "front bumper", [2.02, 0.2, 0.25], darkMaterial, [0, 0.47, -2.17]);
  addBox(group, "rear diffuser", [1.85, 0.18, 0.22], darkMaterial, [0, 0.43, 2.18]);

  // Headlights and rear lights.
  addBox(group, "left headlight", [0.42, 0.08, 0.06], lightMaterial, [-0.68, 0.83, -2.23]);
  addBox(group, "right headlight", [0.42, 0.08, 0.06], lightMaterial, [0.68, 0.83, -2.23]);
  addBox(group, "left tail light", [0.58, 0.075, 0.06], tailMaterial, [-0.61, 0.78, 2.24]);
  addBox(group, "right tail light", [0.58, 0.075, 0.06], tailMaterial, [0.61, 0.78, 2.24]);

  // Wheels and metallic rims.
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 24);
  const rimGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.295, 16);

  for (const x of [-1.02, 1.02]) {
    for (const z of [-1.38, 1.42]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.45, z);

      const tire = new THREE.Mesh(wheelGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);

      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.31, 12),
        darkMaterial
      );
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);

      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // Subtle underbody glow.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 4.0),
    new THREE.MeshBasicMaterial({
      color: 0x183cff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.18;
  group.add(glow);

  group.position.set(0, 0, 2);
  scene.add(group);
  return group;
}

function buildRoad() {
  const roadMaterial = makeMaterial(0x20252c, 0.94);
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xe6e8eb });
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x4d9cff });
  const groundMaterial = makeMaterial(0x10151b, 1);
  const railMaterial = makeMaterial(0x4a515a, 0.45, 0.5);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 1800),
    groundMaterial
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.14, -500);
  ground.receiveShadow = true;
  scene.add(ground);

  for (let i = 0; i < config.segmentCount; i++) {
    const segment = new THREE.Group();
    const z = -i * config.segmentLength;

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(config.roadWidth, 0.18, config.segmentLength),
      roadMaterial
    );
    road.position.y = -0.08;
    road.receiveShadow = true;
    road.castShadow = false;
    segment.add(road);

    // Roadside glowing lines.
    for (const x of [-config.roadWidth / 2 + 0.25, config.roadWidth / 2 - 0.25]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.025, config.segmentLength),
        edgeMaterial
      );
      edge.position.set(x, 0.025, 0);
      segment.add(edge);
    }

    // Dashed centre line.
    for (let dash = 0; dash < 6; dash++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.025, 5.2),
        lineMaterial
      );
      stripe.position.set(0, 0.025, -config.segmentLength / 2 + 8 + dash * 14);
      segment.add(stripe);
    }

    // Side rails.
    for (const x of [-config.roadWidth / 2 - 0.45, config.roadWidth / 2 + 0.45]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.48, config.segmentLength),
        railMaterial
      );
      rail.position.set(x, 0.25, 0);
      segment.add(rail);
    }

    segment.position.z = z;
    scene.add(segment);
    roadSegments.push(segment);
  }
}

function buildEnvironment() {
  scene.background = new THREE.Color(0x07101d);
  scene.fog = new THREE.Fog(0x07101d, 100, 650);

  const hemisphere = new THREE.HemisphereLight(0x9bc8ff, 0x161922, 2.1);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xc2dcff, 3.1);
  sun.position.set(-25, 45, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -25;
  scene.add(sun);

  const fill = new THREE.PointLight(0x2d64ff, 22, 75);
  fill.position.set(8, 6, 4);
  scene.add(fill);

  // Distant procedural skyline.
  const city = new THREE.Group();
  const buildingMaterials = [
    makeMaterial(0x111c2b, 0.85),
    makeMaterial(0x16263a, 0.82),
    makeMaterial(0x1b2333, 0.8)
  ];

  for (let side of [-1, 1]) {
    for (let i = 0; i < 55; i++) {
      const height = 8 + Math.random() * 38;
      const width = 3 + Math.random() * 8;
      const depth = 4 + Math.random() * 10;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        buildingMaterials[i % buildingMaterials.length]
      );
      building.position.set(
        side * (18 + Math.random() * 100),
        height / 2 - 0.1,
        -i * 18 - Math.random() * 15
      );
      building.castShadow = true;
      city.add(building);
    }
  }
  scene.add(city);

  // Stars.
  const starPositions = [];
  for (let i = 0; i < 900; i++) {
    starPositions.push(
      (Math.random() - 0.5) * 1000,
      20 + Math.random() * 220,
      -Math.random() * 1200
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3)
  );
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xb7d7ff,
      size: 0.75,
      transparent: true,
      opacity: 0.8
    })
  );
  scene.add(stars);
}

function buildRamps() {
  const rampMaterial = new THREE.MeshStandardMaterial({
    color: 0x354b6a,
    metalness: 0.65,
    roughness: 0.35,
    emissive: 0x0b2c6e,
    emissiveIntensity: 0.45
  });

  // Ramps are arcade obstacles in the game world.
  for (let i = 0; i < 5; i++) {
    const ramp = new THREE.Group();
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.35, 8),
      rampMaterial
    );
    platform.position.y = 0.42;
    platform.rotation.x = -0.13;
    platform.castShadow = true;
    platform.receiveShadow = true;
    ramp.add(platform);

    const stripMaterial = new THREE.MeshBasicMaterial({
      color: 0x42a5ff,
      toneMapped: false
    });
    for (const x of [-1.9, 1.9]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.035, 7.7),
        stripMaterial
      );
      strip.position.set(x, 0.62, 0);
      ramp.add(strip);
    }

    ramp.position.set(i % 2 === 0 ? -2.5 : 2.5, 0, -160 - i * 235);
    ramp.userData.used = false;
    scene.add(ramp);
    ramps.push(ramp);
  }
}

function showMessage(message, duration = 1300) {
  if (!centerMessage) return;
  centerMessage.textContent = message;
  centerMessage.classList.add("visible");
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => {
    centerMessage.classList.remove("visible");
  }, duration);
}

function setLoadingProgress(percent) {
  if (progressBar) progressBar.style.width = `${percent}%`;
}

function init() {
  const canvasHost = document.body;
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(
    66,
    window.innerWidth / window.innerHeight,
    0.1,
    1800
  );
  camera.position.set(0, 5.1, 10.5);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.id = "game-canvas";
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.zIndex = "0";
  renderer.domElement.style.display = "block";
  canvasHost.prepend(renderer.domElement);

  setLoadingProgress(18);
  buildEnvironment();
  setLoadingProgress(42);
  buildRoad();
  setLoadingProgress(65);
  buildRamps();
  car = buildCar();
  setLoadingProgress(86);

  bindControls();
  resize();
  setLoadingProgress(100);

  window.setTimeout(() => {
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
    loadingScreen.style.display = "none";
  }

  running = true;
  animate();
}, 450);
}

function bindControls() {
  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    keys[key] = true;

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }

    if ((key === "escape" || key === "p") && started) {
      togglePause();
    }
    if (key === "enter" && !started) startGame();
    if ((key === "r") && started) restartGame();
  });

  window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
  });

  const bindHold = (id, name) => {
    const element = $(id);
    if (!element) return;

    const down = (event) => {
      event.preventDefault();
      touch[name] = true;
      element.classList.add("active");
    };
    const up = (event) => {
      event.preventDefault();
      touch[name] = false;
      element.classList.remove("active");
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("pointerleave", up);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
  };

  bindHold("steer-left", "left");
  bindHold("steer-right", "right");
  bindHold("accelerate-button", "accelerate");
  bindHold("brake-button", "brake");

  const startButton = $("start-button");
  if (startButton) startButton.addEventListener("click", startGame);

  const resumeButton = $("resume-button");
  if (resumeButton) resumeButton.addEventListener("click", resumeGame);

  const restartButton = $("restart-button");
  if (restartButton) restartButton.addEventListener("click", restartGame);

  const restartPauseButton = $("restart-pause-button");
  if (restartPauseButton) {
    restartPauseButton.addEventListener("click", restartGame);
  }

  if (pauseButton) pauseButton.addEventListener("click", togglePause);

  // Show touch controls on touch-capable devices.
  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800) {
    const controls = $("mobile-controls");
    if (controls) controls.classList.add("visible");
  }
}

function startGame() {
  started = true;
  paused = false;
  speed = 0;
  distance = 0;
  carX = 0;
  steering = 0;
  verticalVelocity = 0;
  airborne = false;
  jumpTime = 0;
  ramps.forEach((ramp, i) => {
    ramp.userData.used = false;
    ramp.position.z = -160 - i * 235;
  });

  if (startMenu) startMenu.classList.add("hidden");
  if (pauseMenu) pauseMenu.classList.add("hidden");
  if (pauseButton) pauseButton.classList.remove("hidden");
  showMessage("DRIVE", 1000);
  startAudio();
}

function togglePause() {
  if (!started) return;
  if (paused) resumeGame();
  else pauseGame();
}

function pauseGame() {
  paused = true;
  if (pauseMenu) pauseMenu.classList.remove("hidden");
  if (pauseButton) pauseButton.classList.add("hidden");
  if (engineGain && engineAudio) engineGain.gain.setTargetAtTime(0, engineAudio.currentTime, 0.08);
}

function resumeGame() {
  paused = false;
  if (pauseMenu) pauseMenu.classList.add("hidden");
  if (pauseButton) pauseButton.classList.remove("hidden");
  if (engineGain && engineAudio) engineGain.gain.setTargetAtTime(0.045, engineAudio.currentTime, 0.08);
  clock.getDelta();
}

function restartGame() {
  startGame();
}

function startAudio() {
  if (audioStarted) {
    if (engineAudio && engineAudio.state === "suspended") engineAudio.resume();
    return;
  }

  try {
    engineAudio = new (window.AudioContext || window.webkitAudioContext)();
    engineOscillator = engineAudio.createOscillator();
    engineGain = engineAudio.createGain();

    const filter = engineAudio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 230;

    engineOscillator.type = "sawtooth";
    engineOscillator.frequency.value = 45;
    engineGain.gain.value = 0.035;

    engineOscillator.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(engineAudio.destination);
    engineOscillator.start();
    audioStarted = true;
  } catch (error) {
    console.warn("Audio is unavailable on this device.", error);
  }
}

function updateAudio() {
  if (!engineAudio || !engineOscillator || !engineGain) return;
  const now = engineAudio.currentTime;
  engineOscillator.frequency.setTargetAtTime(42 + speed * 1.55, now, 0.12);
  engineGain.gain.setTargetAtTime(started && !paused ? 0.018 + speed * 0.00032 : 0, now, 0.12);
}

function updateDriving(dt) {
  if (!started || paused) return;

  const accelerating = keys["arrowup"] || keys["w"] || touch.accelerate;
  const braking = keys["arrowdown"] || keys["s"] || touch.brake;
  const left = keys["arrowleft"] || keys["a"] || touch.left;
  const right = keys["arrowright"] || keys["d"] || touch.right;

  if (accelerating) speed += config.acceleration * dt;
  else speed -= config.drag * dt;

  if (braking) speed -= config.braking * dt;
  speed = clamp(speed, 0, config.maxSpeed);

  const steerTarget = (right ? 1 : 0) - (left ? 1 : 0);
  steering = lerp(steering, steerTarget, Math.min(1, dt * 5));
  carX += steering * config.steeringSpeed * (0.4 + speed / config.maxSpeed) * dt;
  carX = clamp(carX, -5.9, 5.9);

  distance += speed * dt * 0.28;

  // Move the world toward the player to create forward motion.
  for (const segment of roadSegments) {
    segment.position.z += speed * dt;
    if (segment.position.z > config.segmentLength) {
      segment.position.z -= config.segmentLength * config.segmentCount;
    }
  }

  for (const ramp of ramps) {
    ramp.position.z += speed * dt;
    if (ramp.position.z > 18) {
      ramp.position.z -= 5 * 235;
      ramp.userData.used = false;
    }

    if (
      !ramp.userData.used &&
      Math.abs(ramp.position.z - car.position.z) < 3.5 &&
      Math.abs(carX - ramp.position.x) < 2.3 &&
      speed > 22 &&
      !airborne
    ) {
      ramp.userData.used = true;
      airborne = true;
      verticalVelocity = 8 + speed * 0.075;
      jumpTime = 0;
      showMessage("AIRBORNE", 850);
    }
  }

  if (airborne) {
    jumpTime += dt;
    verticalVelocity -= 17 * dt;
    car.position.y += verticalVelocity * dt;

    // A modest arcade-style nose pitch during a jump.
    car.rotation.x = lerp(car.rotation.x, -0.16, dt * 3);

    if (car.position.y <= 0) {
      car.position.y = 0;
      verticalVelocity = 0;
      airborne = false;
      car.rotation.x = 0;
      shake = 0.18;
      showMessage("LANDING", 650);
    }
  }

  car.position.x = lerp(car.position.x, carX, Math.min(1, dt * 8));
  car.rotation.z = lerp(car.rotation.z, -steering * 0.12, Math.min(1, dt * 5));

  for (const wheel of wheels) {
    wheel.rotation.x -= speed * dt * 0.34;
  }

  if (shake > 0) shake = Math.max(0, shake - dt);
  bestSpeed = Math.max(bestSpeed, speed);

  if (speedValue) speedValue.textContent = `${Math.round(speed * 3.6)}`;
  if (distanceValue) distanceValue.textContent = `${(distance / 1000).toFixed(2)} km`;
  if (bestSpeedValue) bestSpeedValue.textContent = `${Math.round(bestSpeed * 3.6)}`;
  updateAudio();
}

function updateCamera(dt) {
  if (!car || !camera) return;

  const targetPosition = new THREE.Vector3(
    car.position.x * 0.56,
    5.2 + car.position.y * 0.7,
    car.position.z + 10.4
  );

  camera.position.lerp(targetPosition, Math.min(1, dt * 3.2));

  const lookAt = new THREE.Vector3(
    car.position.x * 0.22,
    0.9 + car.position.y * 0.55,
    car.position.z - 13
  );
  camera.lookAt(lookAt);

  if (shake > 0) {
    camera.position.y += Math.sin(performance.now() * 0.055) * shake;
  }

  const targetFov = 66 + (speed / config.maxSpeed) * 10;
  camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 2.2));
  camera.updateProjectionMatrix();
}

function resize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
}

function animate() {
  if (!running) return;
  requestAnimationFrame(animate);

  // Prevent giant physics steps when returning from another app.
  const dt = Math.min(clock.getDelta(), 0.04);

  if (!paused) {
    updateDriving(dt);
    updateCamera(dt);
  }

  renderer.render(scene, camera);
}

try {
  init();
} catch (error) {
  console.error("Game initialization failed:", error);
  if (loadingScreen) {
    loadingScreen.classList.remove("hidden");
    loadingScreen.innerHTML =
      '<div style="padding:24px;text-align:center;color:white;font:16px system-ui">The game could not start. Check your internet connection and reload the page.</div>';
  }
}
