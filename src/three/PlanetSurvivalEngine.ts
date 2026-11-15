import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SpaceAudioEngine } from '../game/audio';
import {
  canAffordCost,
  computeCompletedTasks,
  craftBlueprint,
  createInitialInventory,
  getEffectiveGravityMps2,
  HYPOXIA_GRACE_SEC,
  LANDING_PAD_CENTER,
  MINE_SITE_COORDS,
  MOON_GRAVITY_G,
  PLANET_CATALOG,
  resolveCircleCollision,
  ROVER_CATALOG,
  spendCost,
  stepCharacterJump,
  stepHypoxiaTimer,
  stepOxygenLevel,
  SUIT_CATALOG,
  survivalTerrainHeight,
  survivalTerrainNormal,
  WEATHER_TYPES,
  type CircleCollider,
  type JumpPhysicsState,
  type SurvivalPlanetSpec,
  type SurvivalRoverSpec,
  type SurvivalSuitSpec,
} from '../game/survival';
import type {
  GraphicsQuality,
  MaterialId,
  SurvivalCraftKind,
  SurvivalInventory,
  SurvivalPhase,
  SurvivalPlanetId,
  SurvivalResourceType,
  SurvivalRoverId,
  SurvivalSuitId,
  SurvivalTelemetry,
} from '../types/game';
import { createSpaceShuttle, type ShuttleAssembly } from './shuttle';
import {
  createBrushedMetalTexture,
  createContactShadowTexture,
  createMoonTextures,
  createParticleTexture,
  createPlanetaryRegolithTextures,
  createThermalTileTexture,
} from './textures';

export interface SurvivalEngineCallbacks {
  onTelemetry: (telemetry: SurvivalTelemetry) => void;
  onToast: (message: string) => void;
  onMissionComplete: (planetName: string) => void;
  onMissionFailed?: () => void;
}

interface DepositNode {
  group: THREE.Group;
  crystalGroup: THREE.Group;
  type: SurvivalResourceType;
  active: boolean;
  baseY: number;
  crystalMat: THREE.MeshStandardMaterial;
  pulseRing: THREE.Mesh;
  light: THREE.PointLight;
}

interface ParticleSpriteItem {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseSize: number;
}

const RESOURCE_COLORS: Record<SurvivalResourceType, number> = {
  ice: 0x76eaff,
  iron: 0xe18b54,
  silicon: 0xc49cff,
};

const SHUTTLE_SCALE = 1.15;
const SHUTTLE_GEAR_OFFSET_Y = 1.68 * SHUTTLE_SCALE;
const PAD_SURFACE_OFFSET_Y = 0.24;

// Pre-allocated scratch helpers to avoid per-frame GC inside step()
const _upVec = new THREE.Vector3(0, 1, 0);
const _targetNormal = new THREE.Vector3();
const _slopeQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _finalQuat = new THREE.Quaternion();
const _beamOrigin = new THREE.Vector3();
const _beamTarget = new THREE.Vector3();

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export class PlanetSurvivalEngine {
  private readonly container: HTMLElement;
  private readonly audio: SpaceAudioEngine;
  private readonly callbacks: SurvivalEngineCallbacks;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly disposableResources: Array<{ dispose: () => void }> = [];

  private readonly sunLight: THREE.DirectionalLight;
  private readonly skyDome: THREE.Mesh;
  private readonly skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
  private readonly moonMesh: THREE.Mesh;
  private readonly moonRing: THREE.Mesh;
  private readonly moonGlow: THREE.Sprite;
  private readonly groundMesh: THREE.Mesh;
  private readonly boulderInstanced: THREE.InstancedMesh;

  private readonly shuttle: ShuttleAssembly;
  private shuttleMaterial: MaterialId;
  private readonly padBeaconLights: THREE.MeshBasicMaterial[] = [];

  private readonly roverGroup: THREE.Group;
  private readonly roverWheels: THREE.Group[] = [];
  private readonly roverMastHead: THREE.Group;
  private readonly roverHullMat: THREE.MeshStandardMaterial;
  private readonly roverAccentMat: THREE.MeshStandardMaterial;
  private roverHeading = 0;
  private readonly roverVel = new THREE.Vector3();
  private roverSpeedMps = 0;
  private roverVerticalY = 0;
  private roverVerticalVy = 0;

  private readonly astronautGroup: THREE.Group;
  private astronautShadowMesh: THREE.Mesh | null = null;
  private astronautJumpState: JumpPhysicsState = { offsetY: 0, vy: 0, grounded: true };
  private jumpQueued = false;
  private readonly suitMat: THREE.MeshStandardMaterial;
  private readonly visorMat: THREE.MeshStandardMaterial;
  private readonly packMat: THREE.MeshStandardMaterial;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;

  private readonly drillAugers: THREE.Mesh[] = [];
  private readonly miningLaser: THREE.Mesh;
  private readonly miningLaserMat: THREE.MeshBasicMaterial;
  private readonly exhaustPool: ParticleSpriteItem[] = [];
  private readonly sparkPool: ParticleSpriteItem[] = [];

  private readonly staticColliders: CircleCollider[] = [];
  private readonly bunkerColliders: CircleCollider[] = [];

  private weatherParticles: THREE.Points | null = null;
  private deposits: DepositNode[] = [];
  private readonly bunkers: THREE.Group[] = [];
  private readonly bunkerRadars: THREE.Group[] = [];
  private beaconGroup: THREE.Group | null = null;
  private beaconCrystal: THREE.Mesh | null = null;
  private beaconRing: THREE.Mesh | null = null;

  private readonly particleTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly metalBumpTex: THREE.CanvasTexture;
  private readonly thermalTileTex: THREE.CanvasTexture;
  private readonly terrainTex: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture };

  private readonly camPosSmooth = new THREE.Vector3(0, 14, 24);
  private readonly camTargetSmooth = new THREE.Vector3(0, 3, -5);

  private readonly keys: Record<string, boolean> = {};
  private drag = false;
  private pointerX = 0;
  private pointerY = 0;

  private phase: SurvivalPhase = 'intro';
  private paused = false;
  private disposed = false;
  private frameId = 0;
  private lastTimeMs = 0;
  private elapsedTotal = 0;
  private hudSyncAccum = 0;
  private trauma = 0;

  private yaw = 0.12;
  private pitch = -0.14;
  private walkPhase = 0;
  private descentTimer = 0;
  private readonly descentDuration: number;
  private touchdownTriggered = false;

  private oxygen = 100;
  private hypoxiaTimer = HYPOXIA_GRACE_SEC;
  private hypoxiaWarned = false;
  private energyRechargeAccum = 0;
  private roverBattery = 100;
  private driving = false;
  private nearRover = false;
  private autoOrbit = false;
  private scanTime = 0;
  private weatherIndex = 0;
  private weatherClock = 0;
  private mineHold = 0;
  private mineTarget: DepositNode | null = null;
  private mineCompleted = false;
  private promptText = 'Review mission briefing and enter orbit.';

  private moonGravityEnabled = true;
  private inventory: SurvivalInventory = createInitialInventory();
  private currentPlanet: SurvivalPlanetSpec = PLANET_CATALOG[0];
  private currentSuit: SurvivalSuitSpec = SUIT_CATALOG[0];
  private currentRover: SurvivalRoverSpec = ROVER_CATALOG[0];
  private readonly unlockedPlanets = new Set<SurvivalPlanetId>(['kepler', 'moon']);
  private readonly unlockedSuits = new Set<SurvivalSuitId>(['mk1']);
  private readonly unlockedRovers = new Set<SurvivalRoverId>(['pathfinder']);

  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    audio: SpaceAudioEngine,
    callbacks: SurvivalEngineCallbacks,
    initialQuality: GraphicsQuality,
    startPhase: 'intro' | 'surface' = 'intro',
    shuttleMaterial: MaterialId = 'TITANIUM'
  ) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;
    this.shuttleMaterial = shuttleMaterial;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();
    this.descentDuration = this.isSoftwareGl ? 1.8 : 3.2;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.applyQuality(initialQuality);

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d1e);
    this.scene.fog = new THREE.Fog(0x070d1e, 40, 120);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();
    this.disposableResources.push(envTarget);

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 290);
    this.camera.position.copy(this.camPosSmooth);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.particleTex = createParticleTexture();
    this.shadowTex = createContactShadowTexture();
    this.metalBumpTex = createBrushedMetalTexture();
    this.thermalTileTex = createThermalTileTexture(maxAniso);
    this.terrainTex = createPlanetaryRegolithTextures(maxAniso);
    const moonTex = createMoonTextures(maxAniso);
    this.disposableResources.push(
      this.particleTex,
      this.shadowTex,
      this.metalBumpTex,
      this.thermalTileTex,
      this.terrainTex.map,
      this.terrainTex.bumpMap,
      moonTex.map,
      moonTex.bumpMap
    );

    // Warm/cool 3-point lighting rig
    this.scene.add(new THREE.HemisphereLight(0xc2e2ff, 0x4a3930, 1.7));
    this.sunLight = new THREE.DirectionalLight(0xffdfb0, 3.2);
    this.sunLight.position.set(-28, 44, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.scene.add(this.sunLight);
    const rimLight = new THREE.DirectionalLight(0x52c8ff, 1.25);
    rimLight.position.set(24, 18, -30);
    this.scene.add(rimLight);

    // Atmospheric sky dome
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(this.currentPlanet.skyTop) },
      uHorizonColor: { value: new THREE.Color(this.currentPlanet.skyHorizon) },
    };
    const skyGeo = new THREE.SphereGeometry(195, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vWorldPos; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 uTopColor; uniform vec3 uHorizonColor; varying vec3 vWorldPos; void main(){ float h = normalize(vWorldPos).y; float t = smoothstep(-0.08, 0.62, h); gl_FragColor = vec4(mix(uHorizonColor, uTopColor, t), 1.0); }`,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);
    this.disposableResources.push(skyGeo, skyMat);

    // Host star halo in sky aligned with key light
    const sunSpriteMat = new THREE.SpriteMaterial({
      map: this.particleTex,
      color: 0xffebb8,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sunSprite = new THREE.Sprite(sunSpriteMat);
    sunSprite.position.set(-55, 68, -60);
    sunSprite.scale.setScalar(18);
    this.scene.add(sunSprite);
    this.disposableResources.push(sunSpriteMat);

    // Deep-space starfield
    const starGeo = new THREE.BufferGeometry();
    const starPositions: number[] = [];
    for (let i = 0; i < 2100; i++) {
      starPositions.push(
        (hash2D(i, 1.3) - 0.5) * 290,
        hash2D(i, 2.7) * 125 + 8,
        (hash2D(i, 4.1) - 0.5) * 290
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xdff0ff,
      map: this.particleTex,
      size: 1.15,
      transparent: true,
      opacity: 0.92,
      alphaTest: 0.05,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));
    this.disposableResources.push(starGeo, starMat);

    // Distant moon with glow halo & optional orbital ring
    const moonGeo = new THREE.SphereGeometry(7.5, 36, 36);
    const moonMat = new THREE.MeshStandardMaterial({
      color: this.currentPlanet.moonColor,
      map: moonTex.map,
      bumpMap: moonTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.88,
      metalness: 0.05,
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.position.set(38, 30, -78);
    this.scene.add(this.moonMesh);

    const ringGeo = new THREE.RingGeometry(10.5, 14.8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9bdfff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.moonRing = new THREE.Mesh(ringGeo, ringMat);
    this.moonRing.position.copy(this.moonMesh.position);
    this.moonRing.rotation.set(1.18, 0.25, -0.35);
    this.moonRing.visible = Boolean(this.currentPlanet.hasRingMoon);
    this.scene.add(this.moonRing);

    const moonGlowMat = new THREE.SpriteMaterial({
      map: this.particleTex,
      color: 0x6bcaff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.moonGlow = new THREE.Sprite(moonGlowMat);
    this.moonGlow.scale.setScalar(26);
    this.moonGlow.position.copy(this.moonMesh.position);
    this.scene.add(this.moonGlow);
    this.disposableResources.push(moonGeo, moonMat, ringGeo, ringMat, moonGlowMat);

    // Planetary terrain (flattened cleanly at landing pad)
    const groundGeo = new THREE.PlaneGeometry(220, 220, 108, 108);
    groundGeo.rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    const terrainColors: number[] = [];
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const h = survivalTerrainHeight(x, z);
      gp.setY(i, h);
      const shade = THREE.MathUtils.clamp(0.78 + h * 0.12 + Math.sin(x * 0.28 + z * 0.19) * 0.04, 0.58, 0.96);
      terrainColors.push(
        this.currentPlanet.groundTint[0] * shade,
        this.currentPlanet.groundTint[1] * shade,
        this.currentPlanet.groundTint[2] * shade
      );
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: this.terrainTex.map,
      bumpMap: this.terrainTex.bumpMap,
      bumpScale: 0.18,
      roughness: 0.94,
      metalness: 0.04,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.position.y = -0.02;
    this.scene.add(this.groundMesh);
    this.disposableResources.push(groundGeo, groundMat);

    // Instanced perimeter ridges & surface boulders (with real physics colliders for large rocks)
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const vx = rp.getX(i);
      const vy = rp.getY(i);
      const vz = rp.getZ(i);
      const n = 0.76 + hash2D(vx * 13.7 + vy * 7.1, vz * 19.3) * 0.44;
      rp.setXYZ(i, vx * n, vy * (n * 0.68), vz * n);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.terrainTex.map,
      bumpMap: this.terrainTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.92,
      metalness: 0.06,
    });
    const dummy = new THREE.Object3D();
    const tmpCol = new THREE.Color();

    const ridgeInstanced = new THREE.InstancedMesh(rockGeo, rockMat, 36);
    ridgeInstanced.castShadow = !this.isSoftwareGl;
    ridgeInstanced.receiveShadow = true;
    for (let i = 0; i < 36; i++) {
      const x = (hash2D(i, 1.1) - 0.5) * 145;
      const z = -48 - hash2D(i, 2.2) * 36;
      const s = 2.4 + hash2D(i, 3.3) * 5.2;
      dummy.position.set(x, survivalTerrainHeight(x, z) + s * 0.35, z);
      dummy.rotation.set(hash2D(i, 4.4) * 0.4, hash2D(i, 5.5) * Math.PI * 2, hash2D(i, 6.6) * 0.4);
      dummy.scale.set(s * (1 + hash2D(i, 7.7) * 0.35), s * 0.85, s * (0.9 + hash2D(i, 8.8) * 0.3));
      dummy.updateMatrix();
      ridgeInstanced.setMatrixAt(i, dummy.matrix);
      tmpCol.setRGB(0.28, 0.31, 0.37);
      ridgeInstanced.setColorAt(i, tmpCol);
    }
    ridgeInstanced.computeBoundingSphere();
    this.scene.add(ridgeInstanced);

    this.boulderInstanced = new THREE.InstancedMesh(rockGeo, rockMat, 96);
    this.boulderInstanced.castShadow = !this.isSoftwareGl;
    this.boulderInstanced.receiveShadow = true;
    for (let i = 0; i < 96; i++) {
      let x = (hash2D(i + 50, 1.4) - 0.5) * 96;
      let z = (hash2D(i + 50, 2.8) - 0.5) * 96;
      // Keep landing pad apron & rover spawn clear of boulders
      if (Math.hypot(x - LANDING_PAD_CENTER.x, z - LANDING_PAD_CENTER.z) < 9.5) {
        x += x >= LANDING_PAD_CENTER.x ? 10 : -10;
        z += z >= LANDING_PAD_CENTER.z ? 8 : -8;
      }
      if (Math.hypot(x - 3.8, z - (-3.4)) < 5.5) {
        x += 6.5;
      }
      const s = 0.28 + hash2D(i + 50, 3.9) * 1.32;
      dummy.position.set(x, survivalTerrainHeight(x, z) + s * 0.3, z);
      dummy.rotation.set(hash2D(i, 4.1) * Math.PI, hash2D(i, 5.2) * Math.PI, hash2D(i, 6.3) * Math.PI);
      dummy.scale.set(s * (0.85 + hash2D(i, 7.4) * 0.35), s * (0.6 + hash2D(i, 8.5) * 0.3), s * (0.85 + hash2D(i, 9.6) * 0.35));
      dummy.updateMatrix();
      this.boulderInstanced.setMatrixAt(i, dummy.matrix);
      if (s > 0.72) {
        this.staticColliders.push({ x, z, radius: s * 0.85 });
      }
      const tint = 0.38 + hash2D(i + 50, 6.1) * 0.22;
      tmpCol.setRGB(
        this.currentPlanet.groundTint[0] * (0.7 + tint * 0.4),
        this.currentPlanet.groundTint[1] * (0.7 + tint * 0.4),
        this.currentPlanet.groundTint[2] * (0.7 + tint * 0.4)
      );
      this.boulderInstanced.setColorAt(i, tmpCol);
    }
    this.boulderInstanced.computeBoundingSphere();
    this.scene.add(this.boulderInstanced);
    this.disposableResources.push(rockGeo, rockMat);

    // Upgraded Reinforced Landing Pad at (-3, -5)
    const padX = LANDING_PAD_CENTER.x;
    const padZ = LANDING_PAD_CENTER.z;
    const padGroundY = survivalTerrainHeight(padX, padZ);
    const padTopY = padGroundY + PAD_SURFACE_OFFSET_Y;

    const padDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.75, PAD_SURFACE_OFFSET_Y, 8),
      this.makeMat(0x2f3a49, 0.62, 0.42, true)
    );
    padDeck.position.set(padX, padGroundY + PAD_SURFACE_OFFSET_Y * 0.5, padZ);
    padDeck.receiveShadow = true;
    this.scene.add(padDeck);

    const padRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.95, 0.08, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0x54dfff })
    );
    padRing.rotation.x = Math.PI / 2;
    padRing.position.set(padX, padTopY + 0.04, padZ);
    this.scene.add(padRing);

    const padInnerTarget = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.35, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
    );
    padInnerTarget.rotation.x = -Math.PI / 2;
    padInnerTarget.position.set(padX, padTopY + 0.02, padZ);
    this.scene.add(padInnerTarget);

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const bMat = new THREE.MeshBasicMaterial({ color: 0x54dfff });
      this.padBeaconLights.push(bMat);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bMat);
      b.position.set(padX + Math.cos(a) * 5.0, padTopY + 0.14, padZ + Math.sin(a) * 5.0);
      this.scene.add(b);
    }

    // Power umbilical & O2 transfer terminal on pad rim
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.35, 0.45), this.makeMat(0x475569, 0.4, 0.7, true));
    pylon.position.set(padX + 4.3, padTopY + 0.67, padZ + 1.5);
    this.scene.add(pylon);
    const pylonScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.28, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    pylonScreen.position.set(padX + 4.3, padTopY + 1.05, padZ + 1.72);
    this.scene.add(pylonScreen);

    // Upgraded NASA Space Shuttle Orbiter (matching Levels 01, 02, 03)
    this.shuttle = createSpaceShuttle(this.metalBumpTex, this.thermalTileTex, this.isSoftwareGl);
    this.shuttle.setMaterial(this.shuttleMaterial);
    this.shuttle.setLaunchStackVisible(false);
    this.shuttle.root.scale.setScalar(SHUTTLE_SCALE);
    this.scene.add(this.shuttle.root);
    this.disposableResources.push(this.shuttle);

    // Collider for shuttle core fuselage so actors walk onto the pad apron without clipping inside hull
    this.staticColliders.push({ x: padX, z: padZ, radius: 2.35 });

    // Rover
    this.roverHullMat = this.makeMat(this.currentRover.hullColor, 0.28, 0.78, true);
    this.roverAccentMat = this.makeMat(this.currentRover.accentColor, 0.32, 0.72, true);
    this.roverMastHead = new THREE.Group();
    this.roverGroup = new THREE.Group();
    this.buildRover();
    this.roverGroup.scale.setScalar(1.45);
    this.roverVerticalY = survivalTerrainHeight(4.8, -2.8);
    this.roverGroup.position.set(4.8, this.roverVerticalY, -2.8);
    this.scene.add(this.roverGroup);

    // Astronaut
    this.suitMat = this.makeMat(this.currentSuit.suitColor, 0.42, 0.18, true);
    this.visorMat = new THREE.MeshStandardMaterial({
      color: this.currentSuit.visorColor,
      roughness: 0.1,
      metalness: 0.95,
      envMapIntensity: 1.6,
    });
    this.packMat = this.makeMat(this.currentSuit.packColor, 0.45, 0.32, true);
    this.leftArmPivot = new THREE.Group();
    this.rightArmPivot = new THREE.Group();
    this.leftLegPivot = new THREE.Group();
    this.rightLegPivot = new THREE.Group();
    this.astronautGroup = new THREE.Group();
    this.buildAstronaut();
    this.astronautGroup.position.set(0.2, survivalTerrainHeight(0.2, -1.6), -1.6);
    this.astronautGroup.rotation.y = 0.25;
    this.astronautGroup.visible = startPhase === 'surface';
    this.scene.add(this.astronautGroup);

    // Mining laser
    const laserGeo = new THREE.CylinderGeometry(0.035, 0.055, 1, 8);
    laserGeo.rotateX(Math.PI / 2);
    laserGeo.translate(0, 0, 0.5);
    this.miningLaserMat = new THREE.MeshBasicMaterial({
      color: 0x6beaff,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    this.miningLaser = new THREE.Mesh(laserGeo, this.miningLaserMat);
    this.miningLaser.visible = false;
    this.scene.add(this.miningLaser);
    this.disposableResources.push(laserGeo, this.miningLaserMat);

    this.createParticlePool(this.exhaustPool, 48, 0xffb35c, 1.55);
    this.createParticlePool(this.sparkPool, 36, 0x6beaff, 0.55);

    // Geological deposits & Automated Subsurface Core Drill Stations
    this.spawnDeposits(this.currentPlanet);
    MINE_SITE_COORDS.forEach(([mx, mz]) => {
      this.createDrillStation(mx, mz);
      this.staticColliders.push({ x: mx, z: mz, radius: 1.55 });
    });
    this.setWeather(0, false);

    if (startPhase === 'surface') {
      this.phase = 'surface';
      this.shuttle.root.position.set(padX, padTopY + SHUTTLE_GEAR_OFFSET_Y, padZ);
      this.shuttle.root.rotation.set(0, 0.28, 0);
      this.shuttle.setGearDeployment(1);
      this.shuttle.setHatchOpen(1);
      this.shuttle.setThrustLevel(0, false, 0);
      this.shuttle.setLandingThrusterLevel(0, 0);
      this.promptText = 'Shuttle docked on pad. Hold E near deposits to mine · R for Rover.';
      this.updateCamera(0);
    } else {
      this.shuttle.root.position.set(padX, padTopY + 13.5, padZ - 7);
      this.shuttle.root.rotation.set(-0.14, 0.34, 0);
      this.shuttle.setGearDeployment(0);
      this.shuttle.setHatchOpen(0);
      this.shuttle.setThrustLevel(0.45, false, 0);
      this.shuttle.setLandingThrusterLevel(0.2, 0);
    }

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.lastTimeMs = performance.now();
    this.emitTelemetry();
    this.scheduleLoop();
  }

  private makeMat(color: number, roughness = 0.7, metalness = 0.15, bump = false): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      bumpMap: bump ? this.metalBumpTex : null,
      bumpScale: bump ? 0.015 : 0,
    });
  }

  private addContactShadow(parent: THREE.Object3D, radius: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.04;
    parent.add(m);
    return m;
  }

  private buildAstronaut(): void {
    const jointMat = this.makeMat(0x283546, 0.65, 0.35);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.68, 6, 12), this.suitMat);
    torso.position.y = 1.18;
    this.astronautGroup.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 16), jointMat);
    belt.position.y = 0.86;
    this.astronautGroup.add(belt);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.16), jointMat);
    chest.position.set(0, 1.26, 0.36);
    this.astronautGroup.add(chest);
    const chestLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.07, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x6beaff })
    );
    chestLed.position.set(0, 1.28, 0.44);
    this.astronautGroup.add(chestLed);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 18), this.suitMat);
    head.position.y = 2.04;
    this.astronautGroup.add(head);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 10, 20), jointMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.7;
    this.astronautGroup.add(collar);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.31, 24, 18), this.visorMat);
    visor.position.set(0, 2.06, 0.24);
    visor.scale.set(1.02, 0.76, 0.55);
    this.astronautGroup.add(visor);

    this.leftArmPivot.position.set(-0.5, 1.52, 0);
    const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.56, 5, 10), this.suitMat);
    lArm.position.y = -0.32;
    lArm.rotation.z = -0.12;
    this.leftArmPivot.add(lArm);
    const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), jointMat);
    lGlove.position.set(-0.05, -0.66, 0);
    this.leftArmPivot.add(lGlove);
    this.astronautGroup.add(this.leftArmPivot);

    this.rightArmPivot.position.set(0.5, 1.52, 0);
    const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.56, 5, 10), this.suitMat);
    rArm.position.y = -0.32;
    rArm.rotation.z = 0.12;
    this.rightArmPivot.add(rArm);
    const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), jointMat);
    rGlove.position.set(0.05, -0.66, 0);
    this.rightArmPivot.add(rGlove);
    const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.36, 10), this.makeMat(0x64798c, 0.35, 0.75));
    tool.rotation.x = Math.PI / 2;
    tool.position.set(0.06, -0.66, 0.22);
    this.rightArmPivot.add(tool);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6beaff }));
    tip.position.set(0.06, -0.66, 0.4);
    this.rightArmPivot.add(tip);
    this.astronautGroup.add(this.rightArmPivot);

    this.leftLegPivot.position.set(-0.21, 0.82, 0);
    const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.54, 5, 10), this.suitMat);
    lLeg.position.y = -0.34;
    this.leftLegPivot.add(lLeg);
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.34), jointMat);
    lBoot.position.set(0, -0.72, 0.05);
    this.leftLegPivot.add(lBoot);
    this.astronautGroup.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.21, 0.82, 0);
    const rLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.54, 5, 10), this.suitMat);
    rLeg.position.y = -0.34;
    this.rightLegPivot.add(rLeg);
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.34), jointMat);
    rBoot.position.set(0, -0.72, 0.05);
    this.rightLegPivot.add(rBoot);
    this.astronautGroup.add(this.rightLegPivot);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.32), this.packMat);
    pack.position.set(0, 1.22, -0.36);
    this.astronautGroup.add(pack);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8), this.makeMat(0xbccad6, 0.3, 0.8));
    ant.position.set(0.22, 1.82, -0.42);
    this.astronautGroup.add(ant);
    const lamp = new THREE.PointLight(0x76dfff, 3.2, 8);
    lamp.position.set(0, 2.15, 0.65);
    this.astronautGroup.add(lamp);
    this.astronautShadowMesh = this.addContactShadow(this.astronautGroup, 0.85);
  }

  private buildRover(): void {
    const roverDark = this.makeMat(0x202a35, 0.55, 0.55);
    const roverGlass = new THREE.MeshStandardMaterial({
      color: 0x16415e,
      roughness: 0.1,
      metalness: 0.88,
      envMapIntensity: 1.5,
    });
    const roverRubber = this.makeMat(0x15191e, 0.9, 0.08);

    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.62, 3.05), this.roverHullMat);
    hull.position.y = 1.12;
    this.roverGroup.add(hull);
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.3, 2.72), roverDark);
    lowerHull.position.y = 0.78;
    this.roverGroup.add(lowerHull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.13, 2.5), this.roverAccentMat);
    deck.position.set(0, 1.48, 0);
    this.roverGroup.add(deck);

    for (const x of [-1.14, 1.14]) {
      for (const z of [-1.02, 0, 1.02]) {
        const wPivot = new THREE.Group();
        wPivot.position.set(x, 0.62, z);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.34, 24), roverRubber);
        wheel.rotation.z = Math.PI / 2;
        wPivot.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.365, 20), this.roverHullMat);
        hub.rotation.z = Math.PI / 2;
        wPivot.add(hub);
        const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.38, 16), this.roverAccentMat);
        hubCap.rotation.z = Math.PI / 2;
        wPivot.add(hubCap);
        for (let t = 0; t < 10; t++) {
          const ang = (t * Math.PI * 2) / 10;
          const tread = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.14), roverDark);
          tread.position.set(0, Math.cos(ang) * 0.48, Math.sin(ang) * 0.48);
          tread.rotation.x = -ang;
          wPivot.add(tread);
        }
        this.roverGroup.add(wPivot);
        this.roverWheels.push(wPivot);

        const susp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.8, 10), this.roverAccentMat);
        susp.rotation.z = Math.PI / 2;
        susp.position.set(x * 0.72, 0.9, z);
        this.roverGroup.add(susp);
      }
    }

    const cabinBase = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.48, 1.05), roverDark);
    cabinBase.position.set(0, 1.83, -0.35);
    this.roverGroup.add(cabinBase);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.9), roverGlass);
    cabin.position.set(0, 2.22, -0.35);
    this.roverGroup.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.18), this.roverHullMat);
    roof.position.set(0, 2.49, -0.35);
    this.roverGroup.add(roof);

    for (const side of [-1, 1]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), this.roverAccentMat);
      sup.position.set(side * 0.92, 1.78, 0.85);
      this.roverGroup.add(sup);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.07, 1.45),
        new THREE.MeshStandardMaterial({ color: 0x174a75, roughness: 0.22, metalness: 0.68, envMapIntensity: 1.4 })
      );
      panel.position.set(side * 1.38, 2.03, 0.85);
      panel.rotation.z = side * 0.12;
      this.roverGroup.add(panel);
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.95, 12), this.roverHullMat);
    mast.position.set(0, 2.95, -0.9);
    this.roverGroup.add(mast);
    this.roverMastHead.position.set(0, 3.48, -0.9);
    const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.32), this.roverHullMat);
    this.roverMastHead.add(camHead);
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0x5ce1ff,
          emissive: 0x1b7fa3,
          emissiveIntensity: 0.7,
          roughness: 0.1,
          metalness: 0.85,
        })
      );
      lens.position.set(side * 0.2, 0, -0.175);
      this.roverMastHead.add(lens);
    }
    this.roverGroup.add(this.roverMastHead);

    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8), this.roverAccentMat);
    ant.position.set(0.72, 2.9, -0.72);
    this.roverGroup.add(ant);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: 0x53e2ff }));
    antTip.position.set(0.72, 3.32, -0.72);
    this.roverGroup.add(antTip);

    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 16), this.roverAccentMat);
    armBase.position.set(0, 1.7, 1.52);
    this.roverGroup.add(armBase);
    const armUpper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.85), this.roverHullMat);
    armUpper.position.set(0, 1.65, 1.95);
    armUpper.rotation.x = -0.25;
    this.roverGroup.add(armUpper);
    const armJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), this.roverAccentMat);
    armJoint.position.set(0, 1.53, 2.34);
    this.roverGroup.add(armJoint);
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.045, 0.62, 12), roverDark);
    drill.position.set(0, 1.25, 2.52);
    this.roverGroup.add(drill);
    const drillTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 12), this.roverAccentMat);
    drillTip.position.set(0, 0.91, 2.52);
    this.roverGroup.add(drillTip);

    for (const side of [-1, 1]) {
      const fLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: 0xb8f4ff }));
      fLamp.position.set(side * 0.78, 1.18, 1.56);
      this.roverGroup.add(fLamp);
      const rLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff5548 }));
      rLamp.position.set(side * 0.78, 1.15, -1.56);
      this.roverGroup.add(rLamp);
    }
    this.addContactShadow(this.roverGroup, 2.2);
  }

  private createParticlePool(pool: ParticleSpriteItem[], count: number, color: number, size: number): void {
    const baseMat = new THREE.SpriteMaterial({
      map: this.particleTex,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(baseMat.clone());
      sp.scale.setScalar(size);
      sp.visible = false;
      this.scene.add(sp);
      pool.push({ sprite: sp, vel: new THREE.Vector3(), life: 0, maxLife: 1, baseSize: size });
    }
    baseMat.dispose();
  }

  private spawnParticle(pool: ParticleSpriteItem[], pos: THREE.Vector3, vel: THREE.Vector3, life: number, colorHex: number): void {
    for (const p of pool) {
      if (p.life <= 0) {
        p.sprite.position.copy(pos);
        p.vel.copy(vel);
        p.life = life;
        p.maxLife = life;
        p.sprite.material.color.setHex(colorHex);
        p.sprite.visible = true;
        return;
      }
    }
  }

  private updateParticlePool(pool: ParticleSpriteItem[], dt: number): void {
    for (const p of pool) {
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.position.addScaledVector(p.vel, dt);
        const ratio = p.life / p.maxLife;
        p.sprite.material.opacity = ratio * 0.75;
        p.sprite.scale.setScalar(p.baseSize * (1 + (1 - ratio) * 1.4));
      }
    }
  }

  private spawnDeposits(planet: SurvivalPlanetSpec): void {
    this.deposits.forEach((d) => this.scene.remove(d.group));
    this.deposits = [];
    for (const [type, x, z] of planet.nodes) {
      const group = new THREE.Group();
      const crystalGroup = new THREE.Group();
      const color = RESOURCE_COLORS[type];
      const crystalMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.48,
        roughness: 0.18,
        metalness: 0.35,
        envMapIntensity: 1.5,
      });
      const count = type === 'iron' ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const geo =
          type === 'ice'
            ? new THREE.ConeGeometry(0.28 + hash2D(i, x) * 0.16, 0.95 + hash2D(i, z) * 0.45, 6)
            : new THREE.OctahedronGeometry(0.4 + hash2D(i, x) * 0.22, 0);
        const mesh = new THREE.Mesh(geo, crystalMat);
        mesh.position.set((hash2D(i, 1.7) - 0.5) * 0.9, 0.42 + hash2D(i, 3.1) * 0.38, (hash2D(i, 5.3) - 0.5) * 0.85);
        mesh.rotation.set((hash2D(i, 7.1) - 0.5) * 0.6, hash2D(i, 2.9) * Math.PI, (hash2D(i, 8.3) - 0.5) * 0.6);
        crystalGroup.add(mesh);
      }
      group.add(crystalGroup);
      const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), this.makeMat(0x3b434f, 0.92, 0.08));
      baseRock.scale.set(1.2, 0.45, 1.1);
      baseRock.position.y = 0.12;
      group.add(baseRock);
      const pulseRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.035, 10, 36),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
      );
      pulseRing.rotation.x = Math.PI / 2;
      pulseRing.position.y = 0.09;
      group.add(pulseRing);
      const y = survivalTerrainHeight(x, z);
      group.position.set(x, y, z);
      const light = new THREE.PointLight(color, 1.8, 5.5);
      light.position.y = 1.2;
      group.add(light);
      this.scene.add(group);
      this.deposits.push({ group, crystalGroup, type, active: true, baseY: y, crystalMat, pulseRing, light });
    }
  }

  /**
   * Realistic Automated Subsurface Core Drill & Telemetry Rig (replaces flat arches).
   */
  private createDrillStation(x: number, z: number): void {
    const g = new THREE.Group();
    const steelMat = this.makeMat(0x64748b, 0.38, 0.78, true);
    const darkMat = this.makeMat(0x1e293b, 0.65, 0.45);
    const hazardMat = this.makeMat(0xd97706, 0.42, 0.35);

    const basePad = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.24, 8), darkMat);
    basePad.position.y = 0.12;
    g.add(basePad);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.35, 12), hazardMat);
    collar.position.y = 0.36;
    g.add(collar);

    // Steel tripod gantry struts
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.75, 8), steelMat);
      leg.position.set(Math.cos(a) * 0.65, 1.45, Math.sin(a) * 0.65);
      leg.rotation.z = Math.cos(a) * 0.32;
      leg.rotation.x = -Math.sin(a) * 0.32;
      g.add(leg);
    }

    const headCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.42, 12), steelMat);
    headCap.position.y = 2.75;
    g.add(headCap);

    // Rotating core drill shaft
    const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 2.45, 8), hazardMat);
    auger.position.y = 1.48;
    g.add(auger);
    this.drillAugers.push(auger);

    // Solar wing & telemetry mast
    const solar = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.06, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x134e7e, roughness: 0.22, metalness: 0.72 })
    );
    solar.position.set(0.85, 2.35, 0);
    solar.rotation.z = -0.35;
    g.add(solar);

    const strobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    strobe.position.y = 3.05;
    g.add(strobe);

    this.addContactShadow(g, 1.65);
    g.position.set(x, survivalTerrainHeight(x, z), z);
    this.scene.add(g);
  }

  private setWeather(index: number, announce: boolean): void {
    this.weatherIndex = ((index % WEATHER_TYPES.length) + WEATHER_TYPES.length) % WEATHER_TYPES.length;
    const w = WEATHER_TYPES[this.weatherIndex];
    (this.scene.background as THREE.Color).setHex(w.bgHex);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(w.bgHex);
      this.scene.fog.far = w.fogFar;
    }
    this.skyUniforms.uTopColor.value.setHex(this.weatherIndex === 0 ? this.currentPlanet.skyTop : w.bgHex);
    this.skyUniforms.uHorizonColor.value.setHex(this.weatherIndex === 0 ? this.currentPlanet.skyHorizon : w.bgHex);
    this.sunLight.intensity = w.sunIntensity;

    if (this.weatherParticles) {
      this.scene.remove(this.weatherParticles);
      this.weatherParticles.geometry.dispose();
      (this.weatherParticles.material as THREE.Material).dispose();
    }
    const positions: number[] = [];
    for (let i = 0; i < 680; i++) {
      positions.push((Math.random() - 0.5) * 104, Math.random() * 30 + 1, (Math.random() - 0.5) * 104);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.weatherParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: w.particleColor,
        map: this.particleTex,
        size: this.weatherIndex === 1 ? 1.25 : 0.65,
        transparent: true,
        opacity: this.weatherIndex === 0 ? 0 : 0.62,
        depthWrite: false,
      })
    );
    this.scene.add(this.weatherParticles);
    if (announce) {
      this.callbacks.onToast(`${w.name} conditions active: ${w.impact}.`);
    }
  }

  public enterOrbit(): void {
    this.audio.init();
    this.audio.playUiClick();
    this.phase = 'orbit';
    this.promptText = 'Shuttle in orbital approach. Press BEGIN LANDING to touch down.';
    this.emitTelemetry();
  }

  public beginLanding(): void {
    if (this.phase !== 'orbit' && this.phase !== 'intro') return;
    this.audio.init();
    this.audio.playIgnitionBurst();
    this.phase = 'descent';
    this.descentTimer = 0;
    this.touchdownTriggered = false;
    this.promptText = 'Retro-thrusters firing. Deploying landing gear for touchdown.';
    this.callbacks.onToast('Shuttle descent burn initiated. Deploying landing gear!');
    this.emitTelemetry();
  }

  public retrySurface(): void {
    this.audio.init();
    this.audio.playUiClick();
    const padX = LANDING_PAD_CENTER.x;
    const padZ = LANDING_PAD_CENTER.z;
    this.oxygen = 100;
    this.hypoxiaTimer = HYPOXIA_GRACE_SEC;
    this.hypoxiaWarned = false;
    this.driving = false;
    this.roverVel.set(0, 0, 0);
    this.roverSpeedMps = 0;
    this.astronautJumpState = { offsetY: 0, vy: 0, grounded: true };
    this.jumpQueued = false;
    if (this.astronautShadowMesh) {
      this.astronautShadowMesh.position.y = 0.04;
      (this.astronautShadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.68;
    }
    this.astronautGroup.visible = true;
    this.astronautGroup.position.set(padX + 3.2, survivalTerrainHeight(padX + 3.2, padZ + 3.4), padZ + 3.4);
    this.phase = 'surface';
    this.promptText = 'Emergency evac stabilized at Shuttle pad. Oxygen at 100%.';
    this.callbacks.onToast('Suit pressurized at Shuttle umbilical. Resume expedition!');
    this.emitTelemetry();
  }

  public craft(kind: SurvivalCraftKind): { ok: boolean; message: string } {
    if (this.phase !== 'surface') {
      const msg = 'Land on the planet before crafting.';
      this.callbacks.onToast(msg);
      return { ok: false, message: msg };
    }
    const result = craftBlueprint(this.inventory, kind);
    this.inventory = result.inventory;
    if (result.ok) {
      this.audio.playCraftSuccess();
      this.callbacks.onToast(result.message);
    } else {
      this.callbacks.onToast(result.message);
    }
    this.emitTelemetry();
    return { ok: result.ok, message: result.message };
  }

  public useOxygenCanister(): string {
    if (this.phase !== 'surface') return 'Land on the planet first.';
    if (this.inventory.oxygenKits <= 0) {
      const msg = 'No Oxygen Canisters! Craft one [C] or return to Shuttle Pad / Bunker.';
      this.callbacks.onToast(msg);
      return msg;
    }
    if (this.oxygen >= 99.9) {
      const msg = 'Suit oxygen is already full.';
      this.callbacks.onToast(msg);
      return msg;
    }
    this.inventory = { ...this.inventory, oxygenKits: this.inventory.oxygenKits - 1 };
    this.oxygen = Math.min(100, this.oxygen + 40);
    this.hypoxiaTimer = HYPOXIA_GRACE_SEC;
    this.hypoxiaWarned = false;
    this.audio.playCraftSuccess();
    const msg = `Oxygen refilled (+40% O2). Reserve: ${Math.ceil(this.oxygen)}%.`;
    this.callbacks.onToast(msg);
    this.emitTelemetry();
    return msg;
  }

  public useRoverRepair(): string {
    if (this.phase !== 'surface') return 'Land on the planet first.';
    if (this.inventory.repairKits <= 0) {
      const msg = 'No Rover Repair Kits available. Craft one first!';
      this.callbacks.onToast(msg);
      return msg;
    }
    if (this.roverBattery >= 99.9) {
      const msg = 'Rover battery is already at 100%.';
      this.callbacks.onToast(msg);
      return msg;
    }
    this.inventory = { ...this.inventory, repairKits: this.inventory.repairKits - 1 };
    this.roverBattery = Math.min(100, this.roverBattery + 50);
    this.audio.playCraftSuccess();
    const msg = `Rover repair kit used (+50% Battery). Rover at ${Math.ceil(this.roverBattery)}%.`;
    this.callbacks.onToast(msg);
    this.emitTelemetry();
    return msg;
  }

  public deployBunker(): string {
    if (this.phase !== 'surface') return 'Land on the planet first.';
    if (this.inventory.bunkerKits <= 0) {
      const msg = 'Craft a Habitation Bunker Kit first!';
      this.callbacks.onToast(msg);
      return msg;
    }
    this.inventory = { ...this.inventory, bunkerKits: this.inventory.bunkerKits - 1 };

    const b = new THREE.Group();
    const hullMat = this.makeMat(0x526578, 0.38, 0.72, true);
    const trimMat = this.makeMat(0x233447, 0.5, 0.55);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x6beaff,
      emissive: 0x22c8ff,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.75, 1.3, 20), trimMat);
    base.position.y = 0.65;
    b.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
    dome.position.y = 1.25;
    b.add(dome);
    const airlock = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.55, 1.2), hullMat);
    airlock.position.set(0, 0.78, 2.45);
    b.add(airlock);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.2, 0.1), windowMat);
    door.position.set(0, 0.72, 3.06);
    b.add(door);
    for (const a of [-0.85, 0.85]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.32, 0.15), windowMat);
      win.position.set(Math.sin(a) * 2.35, 1.55, Math.cos(a) * 2.35);
      win.rotation.y = a;
      b.add(win);
    }
    const solar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x164a78, roughness: 0.22, metalness: 0.75 })
    );
    solar.position.set(0, 3.8, 0);
    solar.rotation.x = 0.22;
    b.add(solar);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), trimMat);
    mast.position.set(0, 3.55, 0);
    b.add(mast);
    const radar = new THREE.Group();
    radar.position.set(1.1, 3.25, -0.6);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.22, 16, 1, true), hullMat);
    dish.rotation.x = Math.PI * 0.35;
    radar.add(dish);
    b.add(radar);
    this.bunkerRadars.push(radar);
    const light = new THREE.PointLight(0x6beaff, 10, 16);
    light.position.set(0, 2.2, 0);
    b.add(light);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.1, 5.3, 40),
      new THREE.MeshBasicMaterial({ color: 0x4ae3b5, side: THREE.DoubleSide, transparent: true, opacity: 0.48 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    b.add(ring);

    // Place safely forward of player outside shuttle & boulder collisions
    const rawBx = this.astronautGroup.position.x - Math.sin(this.yaw) * 4.8;
    const rawBz = this.astronautGroup.position.z - Math.cos(this.yaw) * 4.8;
    const resolved = resolveCircleCollision(
      rawBx,
      rawBz,
      2.65,
      [...this.staticColliders, ...this.bunkerColliders],
      44
    );
    b.position.set(resolved.x, survivalTerrainHeight(resolved.x, resolved.z), resolved.z);
    this.scene.add(b);
    this.bunkers.push(b);
    this.bunkerColliders.push({ x: resolved.x, z: resolved.z, radius: 2.5 });
    this.audio.playBunkerDeploy();
    const msg = 'Habitation Bunker built! Safe zone active (+O2, Rover & Scanner recharge).';
    this.callbacks.onToast(msg);
    this.emitTelemetry();
    return msg;
  }

  public deployBeacon(): void {
    if (this.phase !== 'surface') {
      this.callbacks.onToast('Land on the planet before deploying the beacon.');
      return;
    }
    if (this.inventory.beaconKits < 1) {
      this.callbacks.onToast('Craft a Research Beacon Kit first.');
      return;
    }
    this.inventory = { ...this.inventory, beaconKits: this.inventory.beaconKits - 1 };
    this.phase = 'complete';

    const beacon = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 0.55, 16), this.makeMat(0x647c91, 0.35, 0.72, true));
    base.position.y = 0.25;
    beacon.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.1, 12), this.makeMat(0xdce8f2, 0.3, 0.78));
    pole.position.y = 1.8;
    beacon.add(pole);
    this.beaconCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65),
      new THREE.MeshStandardMaterial({ color: 0x61edff, emissive: 0x00bfff, emissiveIntensity: 2.2, roughness: 0.12, metalness: 0.25 })
    );
    this.beaconCrystal.position.y = 3.45;
    beacon.add(this.beaconCrystal);
    this.beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.045, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x61edff, transparent: true, opacity: 0.85 })
    );
    this.beaconRing.rotation.x = Math.PI / 2;
    this.beaconRing.position.y = 3.45;
    beacon.add(this.beaconRing);
    const skyBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.38, 26, 12),
      new THREE.MeshBasicMaterial({
        color: 0x5ce3ff,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    skyBeam.position.y = 16;
    beacon.add(skyBeam);
    const light = new THREE.PointLight(0x38ddff, 26, 26);
    light.position.y = 3.3;
    beacon.add(light);

    const bx = this.astronautGroup.position.x + 2;
    const bz = this.astronautGroup.position.z - 2;
    beacon.position.set(bx, survivalTerrainHeight(bx, bz), bz);
    this.scene.add(beacon);
    this.beaconGroup = beacon;
    this.miningLaser.visible = false;

    this.audio.playMissionComplete();
    this.callbacks.onToast('Research Beacon online!');
    this.emitTelemetry();
    this.callbacks.onMissionComplete(this.currentPlanet.name);
  }

  public scan(): void {
    if (this.phase !== 'surface') {
      this.callbacks.onToast('Land first to scan the surface.');
      return;
    }
    if (this.inventory.energy <= 0) {
      this.callbacks.onToast('No energy cells! Recharge at the Shuttle Pad or a Habitation Bunker.');
      return;
    }
    this.inventory = { ...this.inventory, energy: this.inventory.energy - 1 };
    this.scanTime = 6;
    this.audio.playScannerPulse();
    for (const d of this.deposits) {
      if (d.active) {
        d.crystalMat.emissiveIntensity = 2.6;
      }
    }
    this.callbacks.onToast('Scanner pulse: active mineral deposits highlighted for 6s.');
    this.emitTelemetry();
  }

  public toggleAutoOrbit(): void {
    this.audio.playUiClick();
    this.autoOrbit = !this.autoOrbit;
    this.callbacks.onToast(
      this.autoOrbit ? '360-degree camera orbit enabled.' : 'Camera orbit paused. Drag to look around.'
    );
    this.emitTelemetry();
  }

  public triggerJump(): void {
    if (this.phase !== 'surface' || this.paused) return;
    if (this.driving) {
      this.callbacks.onToast('Exit Rover [R] to jump on foot.');
      return;
    }
    if (this.astronautJumpState.grounded) {
      this.jumpQueued = true;
    }
  }

  public toggleMoonGravity(): void {
    this.audio.init();
    this.audio.playUiClick();
    if (this.currentPlanet.id === 'moon') {
      this.moonGravityEnabled = true;
      this.callbacks.onToast('Luna naturally operates at Moon Gravity (0.16g · 1.62 m/s²).');
      this.emitTelemetry();
      return;
    }
    this.moonGravityEnabled = !this.moonGravityEnabled;
    const msg = this.moonGravityEnabled
      ? 'Moon Gravity active (0.16g · 1.62 m/s²) — high lunar leaps enabled!'
      : `Planet gravity restored (${this.currentPlanet.gravityG.toFixed(2)}g on ${this.currentPlanet.name}).`;
    this.callbacks.onToast(msg);
    this.emitTelemetry();
  }

  public toggleRoverDrive(): void {
    if (this.phase !== 'surface') return;
    if (!this.driving && this.astronautGroup.position.distanceTo(this.roverGroup.position) < 5.4 && this.roverBattery > 0) {
      this.driving = true;
      this.astronautJumpState = { offsetY: 0, vy: 0, grounded: true };
      this.jumpQueued = false;
      this.astronautGroup.visible = false;
      this.audio.playUiClick();
      this.callbacks.onToast('Rover control engaged. WASD to drive.');
    } else if (this.driving) {
      this.driving = false;
      this.roverVel.set(0, 0, 0);
      this.roverSpeedMps = 0;
      this.astronautJumpState = { offsetY: 0, vy: 0, grounded: true };
      this.jumpQueued = false;
      if (this.astronautShadowMesh) {
        this.astronautShadowMesh.position.y = 0.04;
        (this.astronautShadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.68;
      }
      this.astronautGroup.visible = true;
      const exitX = this.roverGroup.position.x - 1.8;
      const exitZ = this.roverGroup.position.z + 1.2;
      const safe = resolveCircleCollision(
        exitX,
        exitZ,
        0.55,
        [...this.staticColliders, ...this.bunkerColliders],
        48
      );
      this.astronautGroup.position.set(safe.x, survivalTerrainHeight(safe.x, safe.z), safe.z);
      this.audio.playUiClick();
      this.callbacks.onToast('Exited rover.');
    } else if (this.roverBattery <= 0) {
      this.callbacks.onToast('Rover battery is empty! Use a Rover Repair Kit [F] first.');
    } else {
      this.callbacks.onToast('Move closer to the rover to enter it.');
    }
    this.emitTelemetry();
  }

  public selectOrUnlockPlanet(id: SurvivalPlanetId): string {
    const item = PLANET_CATALOG.find((p) => p.id === id);
    if (!item) return '';
    if (!this.unlockedPlanets.has(id)) {
      if (!canAffordCost(this.inventory, item.cost)) {
        return `Insufficient mined resources to unlock ${item.name}.`;
      }
      this.inventory = spendCost(this.inventory, item.cost);
      this.unlockedPlanets.add(id);
    }
    this.currentPlanet = item;
    if (item.id === 'moon') {
      this.moonGravityEnabled = true;
    } else if (item.id === 'ares' || item.id === 'glacies') {
      this.moonGravityEnabled = false;
    }
    (this.moonMesh.material as THREE.MeshStandardMaterial).color.setHex(item.moonColor);
    this.moonGlow.material.color.setHex(item.moonColor);
    this.moonRing.visible = Boolean(item.hasRingMoon);

    const gp = this.groundMesh.geometry.attributes.position;
    const gc = this.groundMesh.geometry.attributes.color;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const h = survivalTerrainHeight(x, z);
      const shade = THREE.MathUtils.clamp(0.78 + h * 0.12 + Math.sin(x * 0.28 + z * 0.19) * 0.04, 0.58, 0.96);
      gc.setXYZ(i, item.groundTint[0] * shade, item.groundTint[1] * shade, item.groundTint[2] * shade);
    }
    gc.needsUpdate = true;

    const col = new THREE.Color();
    for (let i = 0; i < this.boulderInstanced.count; i++) {
      const s = 0.72 + hash2D(i, 4.3) * 0.4;
      col.setRGB(item.groundTint[0] * s, item.groundTint[1] * s, item.groundTint[2] * s);
      this.boulderInstanced.setColorAt(i, col);
    }
    if (this.boulderInstanced.instanceColor) this.boulderInstanced.instanceColor.needsUpdate = true;

    this.spawnDeposits(item);
    this.setWeather(item.weatherBias[0], false);
    this.audio.playCraftSuccess();
    const activeG = this.moonGravityEnabled ? MOON_GRAVITY_G : item.gravityG;
    this.callbacks.onToast(`Shuttle jumped to ${item.name} (${activeG.toFixed(2)}g)!`);
    this.emitTelemetry();
    return `Arrived at ${item.name}! Fresh mineral veins detected.`;
  }

  public selectOrUnlockSuit(id: SurvivalSuitId): string {
    const item = SUIT_CATALOG.find((s) => s.id === id);
    if (!item) return '';
    if (!this.unlockedSuits.has(id)) {
      if (!canAffordCost(this.inventory, item.cost)) {
        return `Insufficient mined resources to unlock ${item.name}.`;
      }
      this.inventory = spendCost(this.inventory, item.cost);
      this.unlockedSuits.add(id);
    }
    this.currentSuit = item;
    this.suitMat.color.setHex(item.suitColor);
    this.visorMat.color.setHex(item.visorColor);
    this.packMat.color.setHex(item.packColor);
    this.audio.playCraftSuccess();
    this.callbacks.onToast(`Equipped ${item.name}!`);
    this.emitTelemetry();
    return `Equipped ${item.name}. Suit systems calibrated.`;
  }

  public selectOrUnlockRover(id: SurvivalRoverId): string {
    const item = ROVER_CATALOG.find((r) => r.id === id);
    if (!item) return '';
    if (!this.unlockedRovers.has(id)) {
      if (!canAffordCost(this.inventory, item.cost)) {
        return `Insufficient mined resources to unlock ${item.name}.`;
      }
      this.inventory = spendCost(this.inventory, item.cost);
      this.unlockedRovers.add(id);
    }
    this.currentRover = item;
    this.roverHullMat.color.setHex(item.hullColor);
    this.roverAccentMat.color.setHex(item.accentColor);
    this.audio.playCraftSuccess();
    this.callbacks.onToast(`Switched to ${item.name}!`);
    this.emitTelemetry();
    return `Deployed ${item.name}. Rover telemetry updated.`;
  }

  public setVirtualKey(key: string, pressed: boolean): void {
    this.keys[key.toLowerCase()] = pressed;
    if (!pressed && key.toLowerCase() === 'e') {
      this.mineHold = 0;
      if (this.mineTarget && this.mineTarget.active) {
        this.mineTarget.crystalGroup.scale.setScalar(1);
      }
      if (!this.mineCompleted) this.mineTarget = null;
    }
  }

  public clearKeys(): void {
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
    this.mineHold = 0;
    if (this.mineTarget && this.mineTarget.active) {
      this.mineTarget.crystalGroup.scale.setScalar(1);
    }
    this.mineTarget = null;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.clearKeys();
  }

  public setQuality(quality: GraphicsQuality): void {
    this.applyQuality(quality);
  }

  private applyQuality(quality: GraphicsQuality): void {
    const dpr = window.devicePixelRatio || 1;
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      return;
    }
    if (quality === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      this.drag = true;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    };
    const onPointerUp = () => {
      this.drag = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!this.drag || this.phase !== 'surface' || this.paused) return;
      this.yaw -= (e.clientX - this.pointerX) * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.pointerY) * 0.003, -0.5, 0.45);
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    this.disposableResources.push({
      dispose: () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPointerMove);
      },
    });
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number): void {
    if (this.autoOrbit) this.yaw += dt * 0.42;
    const target = this.driving ? this.roverGroup.position : this.astronautGroup.position;
    const distance = this.driving ? 13.0 : 9.6;
    const desiredPos = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * distance,
      target.y + 4.9 + this.pitch * 5,
      target.z + Math.cos(this.yaw) * distance
    );
    const desiredLook = new THREE.Vector3(target.x, target.y + (this.driving ? 1.35 : 1.45), target.z);
    const alpha = dt > 0 ? 1 - Math.exp(-9 * dt) : 1;
    this.camPosSmooth.lerp(desiredPos, alpha);
    this.camTargetSmooth.lerp(desiredLook, alpha);
    this.camera.position.copy(this.camPosSmooth);
    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(this.camTargetSmooth);
  }

  private scheduleLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const nowMs = performance.now();
      const rawDt = Math.max(0, (nowMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = nowMs;
      const dt = Math.min(rawDt, this.phase === 'descent' ? 0.14 : 0.06);

      if (!this.paused) {
        this.step(dt);
      }
      this.renderer.render(this.scene, this.camera);
      this.afterDraw(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 50);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
        return;
      }
      this.frameId = window.setTimeout(cb, 50);
      return;
    }
    this.frameId = requestAnimationFrame(cb);
  }

  private step(dt: number): void {
    this.elapsedTotal += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.updateParticlePool(this.exhaustPool, dt);
    this.updateParticlePool(this.sparkPool, dt);
    this.roverMastHead.rotation.y = Math.sin(this.elapsedTotal * 0.8) * 0.42;

    // Spin automated core drills & bunker tracking dishes
    for (const auger of this.drillAugers) {
      auger.rotation.y += dt * 4.5;
    }
    for (const r of this.bunkerRadars) {
      r.rotation.y += dt * 1.2;
    }
    // Pulse landing pad approach strobes sequentially
    for (let i = 0; i < this.padBeaconLights.length; i++) {
      const active = Math.floor(this.elapsedTotal * 5) % this.padBeaconLights.length === i;
      this.padBeaconLights[i].color.setHex(active ? 0xffffff : 0x38bdf8);
    }

    if (this.beaconCrystal) {
      this.beaconCrystal.rotation.y += dt * 1.6;
      this.beaconCrystal.position.y = 3.45 + Math.sin(this.elapsedTotal * 2.5) * 0.12;
    }
    if (this.beaconRing) {
      this.beaconRing.scale.setScalar(1 + Math.sin(this.elapsedTotal * 3) * 0.12);
    }

    const padX = LANDING_PAD_CENTER.x;
    const padZ = LANDING_PAD_CENTER.z;
    const padTopY = survivalTerrainHeight(padX, padZ) + PAD_SURFACE_OFFSET_Y;
    const shuttleLandedY = padTopY + SHUTTLE_GEAR_OFFSET_Y;

    if (this.phase === 'intro' || this.phase === 'orbit') {
      const hoverY = padTopY + 13.5 + Math.sin(this.elapsedTotal * 1.4) * 0.25;
      this.shuttle.root.position.set(padX, hoverY, padZ - 7);
      this.shuttle.root.rotation.set(-0.12, -2.18, Math.sin(this.elapsedTotal * 0.7) * 0.04);
      this.shuttle.setThrustLevel(0.42, false, this.elapsedTotal);
      this.shuttle.setLandingThrusterLevel(0.18, this.elapsedTotal);
      this.camera.position.set(1.5, 14.5, 22);
      this.camera.lookAt(padX + 1.5, padTopY + 6.5, padZ - 3);
      return;
    }

    if (this.phase === 'descent') {
      this.descentTimer += dt;
      const t = Math.min(1, this.descentTimer / this.descentDuration);
      const eased = 1 - Math.pow(1 - t, 3);

      const curY = THREE.MathUtils.lerp(padTopY + 13.5, shuttleLandedY, eased);
      const curZ = THREE.MathUtils.lerp(padZ - 7, padZ, eased);
      this.shuttle.root.position.set(padX, curY, curZ);
      this.shuttle.root.rotation.set(
        THREE.MathUtils.lerp(-0.12, 0, eased),
        THREE.MathUtils.lerp(-2.18, -2.05, eased),
        Math.sin(t * Math.PI) * 0.025
      );

      // Deploy 3-point landing gear smoothly during final approach
      const gearT = THREE.MathUtils.clamp((t - 0.25) / 0.45, 0, 1);
      this.shuttle.setGearDeployment(gearT);
      const landingThrust = t < 0.9 ? THREE.MathUtils.clamp(0.45 + t * 0.55, 0, 1) : Math.max(0, (1 - t) / 0.1);
      this.shuttle.setLandingThrusterLevel(landingThrust, this.elapsedTotal);
      this.shuttle.setThrustLevel(Math.max(0, (0.5 - t) * 0.8), false, this.elapsedTotal);

      // Radial exhaust dust on final flare
      if (t > 0.35 && t < 0.95 && Math.random() < 0.65) {
        const ang = Math.random() * Math.PI * 2;
        this.spawnParticle(
          this.exhaustPool,
          new THREE.Vector3(padX + Math.cos(ang) * 1.4, padTopY + 0.35, curZ + Math.sin(ang) * 1.4),
          new THREE.Vector3(Math.cos(ang) * 4.5, 0.9 + Math.random() * 1.1, Math.sin(ang) * 4.5),
          0.75,
          t > 0.65 ? 0xa5b4c4 : 0xffb35c
        );
      }

      if (t >= 0.96 && !this.touchdownTriggered) {
        this.touchdownTriggered = true;
        this.trauma = 0.24;
      }

      this.camera.position.set(6.5, 9.5, 16);
      this.camera.lookAt(padX + 0.5, curY - 0.6, curZ);

      if (t >= 1) {
        this.phase = 'surface';
        this.shuttle.root.position.set(padX, shuttleLandedY, padZ);
        this.shuttle.root.rotation.set(0, -2.05, 0);
        this.shuttle.setGearDeployment(1);
        this.shuttle.setLandingThrusterLevel(0, this.elapsedTotal);
        this.shuttle.setThrustLevel(0, false, this.elapsedTotal);
        this.shuttle.setHatchOpen(1);

        const spawnX = 0.2;
        const spawnZ = -1.6;
        this.astronautGroup.position.set(spawnX, survivalTerrainHeight(spawnX, spawnZ), spawnZ);
        this.astronautGroup.visible = true;
        this.astronautGroup.rotation.y = 0.25;
        this.driving = false;
        this.yaw = 0.12;
        this.pitch = -0.14;
        this.updateCamera(0);
        this.audio.playTouchdown();
        this.promptText = 'Shuttle docked on pad. Hold E near deposits to mine · R for Rover.';
        this.callbacks.onToast('TOUCHDOWN! Space Shuttle docked. Commander Vega on surface.');
        this.emitTelemetry();
      }
      return;
    }

    if (this.phase === 'complete' || this.phase === 'failed') {
      this.updateCamera(dt);
      return;
    }

    // Surface Exploration Physics & Environmental Logic
    const weather = WEATHER_TYPES[this.weatherIndex];
    let wishX = 0;
    let wishZ = 0;
    if (this.keys.w || this.keys.arrowup) {
      wishX -= Math.sin(this.yaw);
      wishZ -= Math.cos(this.yaw);
    }
    if (this.keys.s || this.keys.arrowdown) {
      wishX += Math.sin(this.yaw);
      wishZ += Math.cos(this.yaw);
    }
    if (this.keys.a || this.keys.arrowleft) {
      wishX -= Math.cos(this.yaw);
      wishZ += Math.sin(this.yaw);
    }
    if (this.keys.d || this.keys.arrowright) {
      wishX += Math.cos(this.yaw);
      wishZ -= Math.sin(this.yaw);
    }
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const activeColliders = [...this.staticColliders, ...this.bunkerColliders];
    if (!this.driving) {
      activeColliders.push({
        x: this.roverGroup.position.x,
        z: this.roverGroup.position.z,
        radius: 1.55,
      });
    }

    const effectiveGravityMps2 = getEffectiveGravityMps2(this.currentPlanet.gravityG, this.moonGravityEnabled);
    const effectiveGravityG = this.moonGravityEnabled ? MOON_GRAVITY_G : this.currentPlanet.gravityG;

    if (this.driving) {
      // Realistic Rover Momentum + Planetary/Moon Gravity + Weather Traction + Terrain Slope Alignment
      const maxSpeed = this.currentRover.speed * weather.speedMult;
      const targetVx = wishX * maxSpeed;
      const targetVz = wishZ * maxSpeed;
      const responseRate = 7.5 * weather.tractionMult;
      const blend = 1 - Math.exp(-responseRate * dt);
      this.roverVel.x = THREE.MathUtils.lerp(this.roverVel.x, targetVx, blend);
      this.roverVel.z = THREE.MathUtils.lerp(this.roverVel.z, targetVz, blend);
      this.roverSpeedMps = Math.hypot(this.roverVel.x, this.roverVel.z);

      const nextPos = resolveCircleCollision(
        this.roverGroup.position.x + this.roverVel.x * dt,
        this.roverGroup.position.z + this.roverVel.z * dt,
        1.65,
        activeColliders,
        48
      );
      if (nextPos.collided) {
        this.roverVel.multiplyScalar(0.45);
      }
      this.roverGroup.position.x = nextPos.x;
      this.roverGroup.position.z = nextPos.z;
      const roverGroundY = survivalTerrainHeight(nextPos.x, nextPos.z);
      this.roverVerticalVy -= effectiveGravityMps2 * dt;
      this.roverVerticalY += this.roverVerticalVy * dt;
      if (this.roverVerticalY <= roverGroundY) {
        this.roverVerticalY = roverGroundY;
        this.roverVerticalVy = 0;
      }
      this.roverGroup.position.y = this.roverVerticalY;

      if (this.roverSpeedMps > 0.15) {
        const targetHeading = Math.atan2(this.roverVel.x, this.roverVel.z);
        let diff = targetHeading - this.roverHeading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.roverHeading += diff * Math.min(1, dt * 8 * weather.tractionMult);

        this.roverWheels.forEach((w) => {
          w.rotation.x += this.roverSpeedMps * dt * 1.9;
        });

        if (Math.random() < 0.45) {
          this.spawnParticle(
            this.exhaustPool,
            new THREE.Vector3(
              this.roverGroup.position.x + (Math.random() - 0.5) * 1.4,
              this.roverGroup.position.y + 0.25,
              this.roverGroup.position.z + (Math.random() - 0.5) * 1.4
            ),
            new THREE.Vector3(-this.roverVel.x * 0.35, 0.9, -this.roverVel.z * 0.35),
            0.55,
            this.currentPlanet.id === 'ares' ? 0xb86f50 : this.currentPlanet.id === 'glacies' ? 0xa5d8ff : 0x8a7d72
          );
        }
      }

      // Align rover body smoothly to local terrain normal
      const surfNorm = survivalTerrainNormal(this.roverGroup.position.x, this.roverGroup.position.z);
      _targetNormal.set(surfNorm.x, surfNorm.y, surfNorm.z);
      _slopeQuat.setFromUnitVectors(_upVec, _targetNormal);
      _yawQuat.setFromAxisAngle(_upVec, this.roverHeading);
      _finalQuat.multiplyQuaternions(_slopeQuat, _yawQuat);
      this.roverGroup.quaternion.slerp(_finalQuat, Math.min(1, dt * 10));

      this.astronautGroup.position.copy(this.roverGroup.position);
      const speedDrainFactor = 0.4 + (this.roverSpeedMps / Math.max(1, this.currentRover.speed)) * 0.9;
      this.roverBattery = Math.max(
        0,
        this.roverBattery - dt * 0.048 * speedDrainFactor * this.currentRover.drainMult * (this.weatherIndex === 3 ? 2 : 1)
      );
      if (this.weatherIndex === 0 && this.currentRover.solarCharge > 0) {
        this.roverBattery = Math.min(100, this.roverBattery + dt * this.currentRover.solarCharge);
      }
      if (this.roverBattery <= 0) {
        this.driving = false;
        this.roverVel.set(0, 0, 0);
        this.roverSpeedMps = 0;
        this.astronautGroup.visible = true;
        this.callbacks.onToast('Rover battery depleted! Use a Rover Repair Kit [F] to restore power.');
      }
    } else {
      // Walking & Moon-Gravity Jumping on foot with collision sliding
      this.roverSpeedMps = 0;
      const gravityStepBoost = THREE.MathUtils.clamp(1 + (1 - effectiveGravityG) * 0.18, 0.95, 1.2);
      const walkSpeed = (this.keys.shift ? 8.0 : 4.6) * this.currentSuit.speedMult * weather.speedMult * gravityStepBoost;
      const stepDx = wishX * walkSpeed * dt;
      const stepDz = wishZ * walkSpeed * dt;
      const nextPos = resolveCircleCollision(
        this.astronautGroup.position.x + stepDx,
        this.astronautGroup.position.z + stepDz,
        0.55,
        activeColliders,
        48
      );
      const movedDist = Math.hypot(nextPos.x - this.astronautGroup.position.x, nextPos.z - this.astronautGroup.position.z);

      const wantsJump = this.jumpQueued || Boolean(this.keys[' '] || this.keys.space);
      this.jumpQueued = false;
      const jumpRes = stepCharacterJump(this.astronautJumpState, effectiveGravityMps2, dt, wantsJump);
      this.astronautJumpState = jumpRes.state;

      const groundY = survivalTerrainHeight(nextPos.x, nextPos.z);
      this.astronautGroup.position.x = nextPos.x;
      this.astronautGroup.position.z = nextPos.z;
      this.astronautGroup.position.y = groundY + this.astronautJumpState.offsetY;

      if (jumpRes.jumped) {
        this.audio.playJump();
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI * 2) / 6 + Math.random() * 0.4;
          this.spawnParticle(
            this.exhaustPool,
            new THREE.Vector3(nextPos.x + Math.cos(ang) * 0.25, groundY + 0.15, nextPos.z + Math.sin(ang) * 0.25),
            new THREE.Vector3(Math.cos(ang) * 1.6, 0.8 + Math.random() * 0.6, Math.sin(ang) * 1.6),
            0.45,
            0xcbd5e1
          );
        }
      } else if (jumpRes.landed) {
        this.audio.playLand();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI * 2) / 8 + Math.random() * 0.3;
          this.spawnParticle(
            this.exhaustPool,
            new THREE.Vector3(nextPos.x + Math.cos(ang) * 0.3, groundY + 0.12, nextPos.z + Math.sin(ang) * 0.3),
            new THREE.Vector3(Math.cos(ang) * 2.1, 0.55 + Math.random() * 0.5, Math.sin(ang) * 2.1),
            0.52,
            0xb8c4d0
          );
        }
      }

      if (this.astronautShadowMesh) {
        this.astronautShadowMesh.position.y = 0.04 - this.astronautJumpState.offsetY;
        const shadowMat = this.astronautShadowMesh.material as THREE.MeshBasicMaterial;
        shadowMat.opacity = 0.68 * Math.max(0.2, 1 - this.astronautJumpState.offsetY * 0.22);
      }

      if (movedDist > 0.002) {
        const targetAngle = Math.atan2(wishX, wishZ);
        let diff = targetAngle - this.astronautGroup.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.astronautGroup.rotation.y += diff * Math.min(1, dt * 12);
      }

      if (!this.astronautJumpState.grounded) {
        // Low-gravity lunar leap pose
        const airLerp = Math.min(1, dt * 10);
        const vyNorm = THREE.MathUtils.clamp(this.astronautJumpState.vy / 3.1, -1, 1);
        this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, -0.45 - vyNorm * 0.35, airLerp);
        if (!this.keys.e) {
          this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.35 - vyNorm * 0.3, airLerp);
        }
        this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, -0.32, airLerp);
        this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0.28, airLerp);
      } else if (movedDist > 0.002) {
        this.walkPhase += movedDist * 3.1;
        const swing = Math.sin(this.walkPhase) * 0.65;
        this.leftArmPivot.rotation.x = swing;
        if (!this.keys.e) this.rightArmPivot.rotation.x = -swing;
        this.leftLegPivot.rotation.x = -swing;
        this.rightLegPivot.rotation.x = swing;
        this.astronautGroup.position.y += Math.abs(Math.cos(this.walkPhase)) * 0.04;
      } else {
        const relax = Math.min(1, dt * 10);
        this.leftArmPivot.rotation.x *= 1 - relax;
        if (!this.keys.e) this.rightArmPivot.rotation.x *= 1 - relax;
        this.leftLegPivot.rotation.x *= 1 - relax;
        this.rightLegPivot.rotation.x *= 1 - relax;
      }
    }

    this.nearRover = this.astronautGroup.position.distanceTo(this.roverGroup.position) < 5.4;
    const nearBunker = this.bunkers.some((b) => this.astronautGroup.position.distanceTo(b.position) < 5.6);
    const nearPad = Math.hypot(this.astronautGroup.position.x - padX, this.astronautGroup.position.z - padZ) < 5.8;

    // Shuttle Pad or Bunker Safe Zone recharges Rover Battery & Scanner Energy Cells
    if ((nearBunker || nearPad) && this.astronautGroup.position.distanceTo(this.roverGroup.position) < 8 && this.roverBattery < 100) {
      this.roverBattery = Math.min(100, this.roverBattery + dt * 2.4);
    }
    if ((nearBunker || nearPad) && this.inventory.energy < 2) {
      this.energyRechargeAccum += dt;
      if (this.energyRechargeAccum >= 5.5) {
        this.energyRechargeAccum = 0;
        this.inventory = { ...this.inventory, energy: this.inventory.energy + 1 };
        this.callbacks.onToast('Energy Cell recharged at base umbilical.');
      }
    } else {
      this.energyRechargeAccum = 0;
    }

    this.oxygen = stepOxygenLevel(this.oxygen, dt, {
      nearBunker,
      nearPad,
      driving: this.driving,
      weatherO2Mult: weather.oxygenMult,
      suitO2Mult: this.currentSuit.o2Mult,
    });

    const hypoxia = stepHypoxiaTimer(this.hypoxiaTimer, this.oxygen, dt);
    this.hypoxiaTimer = hypoxia.timer;
    if (this.oxygen <= 0 && !this.hypoxiaWarned) {
      this.hypoxiaWarned = true;
      this.callbacks.onToast('CRITICAL O2 DEPLETED! Refill [Q] or return to Shuttle Pad / Bunker!');
    } else if (this.oxygen > 0.5) {
      this.hypoxiaWarned = false;
    }
    if (hypoxia.expired) {
      this.phase = 'failed';
      this.miningLaser.visible = false;
      this.driving = false;
      this.roverSpeedMps = 0;
      this.promptText = 'CRITICAL HYPOXIA — Emergency orbital extraction triggered.';
      this.audio.playMissionFailed();
      this.emitTelemetry();
      this.callbacks.onMissionFailed?.();
      return;
    }

    // Geological Deposit Proximity & Fracture Mining Laser
    let nearest: DepositNode | null = null;
    let dist = 999;
    for (const d of this.deposits) {
      if (!d.active) continue;
      d.crystalGroup.rotation.y += dt * 0.42;
      d.pulseRing.scale.setScalar(0.92 + Math.sin(this.elapsedTotal * 3 + d.group.position.x) * 0.1);
      const dDist = this.astronautGroup.position.distanceTo(d.group.position);
      if (dDist < dist) {
        dist = dDist;
        nearest = d;
      }
    }

    const reach = this.driving ? this.currentRover.mineReach : 3.8;
    const activeOrigin = this.driving ? this.roverGroup : this.astronautGroup;
    let miningActive = false;

    if (nearest && dist < reach) {
      if (this.mineTarget !== nearest) {
        if (this.mineTarget && this.mineTarget.active) {
          this.mineTarget.crystalGroup.scale.setScalar(1);
        }
        this.mineTarget = nearest;
        this.mineHold = 0;
        this.mineCompleted = false;
      }
      if (this.keys.e && !this.mineCompleted) {
        miningActive = true;
        this.mineHold = Math.min(this.currentSuit.mineTime, this.mineHold + dt);
        const ratio = this.mineHold / this.currentSuit.mineTime;
        const pct = Math.floor(ratio * 100);
        this.promptText = `MINING ${nearest.type.toUpperCase()} · ${pct}% — KEEP HOLDING E`;

        // Face target deposit & vibrate crystals as they fracture
        if (!this.driving) {
          this.rightArmPivot.rotation.x = -1.1;
          const aimYaw = Math.atan2(
            nearest.group.position.x - this.astronautGroup.position.x,
            nearest.group.position.z - this.astronautGroup.position.z
          );
          this.astronautGroup.rotation.y = aimYaw;
        }
        const shrink = THREE.MathUtils.lerp(1, 0.42, ratio);
        nearest.crystalGroup.scale.setScalar(shrink);
        nearest.crystalGroup.position.x = (Math.random() - 0.5) * 0.06 * ratio;

        _beamOrigin.set(
          activeOrigin.position.x,
          activeOrigin.position.y + (this.driving ? 1.75 : 1.35),
          activeOrigin.position.z
        );
        _beamTarget.set(
          nearest.group.position.x,
          nearest.group.position.y + 0.65,
          nearest.group.position.z
        );
        this.miningLaser.position.copy(_beamOrigin);
        this.miningLaser.lookAt(_beamTarget);
        this.miningLaser.scale.set(1, 1, _beamOrigin.distanceTo(_beamTarget));
        this.miningLaserMat.color.setHex(RESOURCE_COLORS[nearest.type]);
        if (Math.random() < 0.6) {
          this.spawnParticle(
            this.sparkPool,
            _beamTarget,
            new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3),
            0.45,
            RESOURCE_COLORS[nearest.type]
          );
        }
        if (this.mineHold >= this.currentSuit.mineTime) {
          this.mineCompleted = true;
          this.collectDeposit(nearest);
          this.mineTarget = null;
          this.mineHold = 0;
        }
      } else if (!this.mineCompleted) {
        this.mineHold = 0;
        nearest.crystalGroup.scale.setScalar(1);
        nearest.crystalGroup.position.x = 0;
        this.promptText = `Hold E to mine ${nearest.type.toUpperCase()} deposit`;
      }
    } else {
      if (this.mineTarget && this.mineTarget.active) {
        this.mineTarget.crystalGroup.scale.setScalar(1);
        this.mineTarget.crystalGroup.position.x = 0;
      }
      this.mineTarget = null;
      this.mineHold = 0;
      this.mineCompleted = false;
      if (this.oxygen <= 0) {
        this.promptText = `CRITICAL HYPOXIA (${Math.ceil(this.hypoxiaTimer)}s)! Press [Q] for O2 or reach Shuttle/Bunker!`;
      } else if (nearBunker) {
        this.promptText = 'INSIDE BUNKER SAFE ZONE — O2, Rover & Scanner recharging.';
      } else if (nearPad) {
        this.promptText = 'SHUTTLE UMBILICAL PAD — O2 & Energy Systems recharging.';
      } else {
        this.promptText = this.driving
          ? 'Drive near deposits and hold E to mine · [R] Exit Rover.'
          : `Explore ${this.currentPlanet.name} (${this.currentPlanet.gravityG}g). Hold E to mine · [C] Craft · [U] Gear.`;
      }
    }
    this.miningLaser.visible = miningActive;

    if (this.scanTime > 0) {
      this.scanTime -= dt;
      if (this.scanTime <= 0) {
        for (const d of this.deposits) {
          if (d.active) d.crystalMat.emissiveIntensity = 0.48;
        }
      }
    }

    this.weatherClock += dt;
    if (this.weatherClock > 55) {
      this.weatherClock = 0;
      const bias = this.currentPlanet.weatherBias;
      this.setWeather(bias[Math.floor(Math.random() * bias.length)], true);
    }
    if (this.weatherParticles && this.weatherIndex !== 0) {
      const attr = this.weatherParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        attr.array[i * 3] += this.weatherIndex === 1 ? 0.14 : 0.04;
        attr.array[i * 3 + 1] -= this.weatherIndex === 2 ? 0.11 : 0.03;
        if (attr.array[i * 3] > 52) attr.array[i * 3] = -52;
        if (attr.array[i * 3 + 1] < 0) attr.array[i * 3 + 1] = 29;
      }
      attr.needsUpdate = true;
    }

    this.updateCamera(dt);

    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.08) {
      this.hudSyncAccum = 0;
      this.emitTelemetry();
    }
  }

  private collectDeposit(node: DepositNode): void {
    if (!node.active) return;
    for (let i = 0; i < 16; i++) {
      this.spawnParticle(
        this.sparkPool,
        new THREE.Vector3(node.group.position.x, node.group.position.y + 0.7, node.group.position.z),
        new THREE.Vector3((Math.random() - 0.5) * 4.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 4.5),
        0.7,
        RESOURCE_COLORS[node.type]
      );
    }
    // Leave depleted basalt bed visually grounded while removing mined crystals & glow
    node.active = false;
    node.crystalGroup.visible = false;
    node.pulseRing.visible = false;
    node.light.visible = false;
    this.inventory = { ...this.inventory, [node.type]: this.inventory[node.type] + 1 };
    this.audio.playMiningComplete();
    this.callbacks.onToast(`Collected ${node.type.toUpperCase()}!`);
    this.emitTelemetry();
  }

  private emitTelemetry(): void {
    const weather = WEATHER_TYPES[this.weatherIndex];
    const roverStatusText = this.driving
      ? 'DRIVING'
      : this.roverBattery <= 0
      ? 'BATTERY EMPTY'
      : this.nearRover
      ? 'IN RANGE · PRESS R'
      : 'READY · PRESS R';

    const moonGravity = this.moonGravityEnabled || this.currentPlanet.id === 'moon';
    const effectiveGravityG = moonGravity ? MOON_GRAVITY_G : this.currentPlanet.gravityG;
    const effectiveGravityMps2 = getEffectiveGravityMps2(this.currentPlanet.gravityG, this.moonGravityEnabled);

    this.callbacks.onTelemetry({
      phase: this.phase,
      planetId: this.currentPlanet.id,
      planetName: this.currentPlanet.name,
      planetGravityG: effectiveGravityG,
      moonGravity,
      effectiveGravityMps2,
      isAirborne: !this.astronautJumpState.grounded,
      shuttleMaterial: this.shuttleMaterial,
      suitId: this.currentSuit.id,
      suitName: this.currentSuit.name,
      roverId: this.currentRover.id,
      roverName: this.currentRover.name,
      weatherName: weather.name,
      weatherIndex: this.weatherIndex,
      weatherVisibility: weather.visibility,
      roverImpact: weather.impact,
      oxygen: this.oxygen,
      hypoxiaTimer: this.hypoxiaTimer,
      roverBattery: this.roverBattery,
      roverSpeedKmh: Math.round(this.roverSpeedMps * 3.6),
      driving: this.driving,
      nearRover: this.nearRover,
      roverStatusText,
      scannerText: this.scanTime > 0 ? 'SCANNING' : 'READY',
      scannerTimer: Math.max(0, this.scanTime),
      bunkerCount: this.bunkers.length,
      autoOrbit: this.autoOrbit,
      promptText: this.promptText,
      mineProgress: this.mineTarget ? this.mineHold / this.currentSuit.mineTime : 0,
      inventory: { ...this.inventory },
      unlockedPlanets: Array.from(this.unlockedPlanets),
      unlockedSuits: Array.from(this.unlockedSuits),
      unlockedRovers: Array.from(this.unlockedRovers),
      completedTasks: computeCompletedTasks(this.inventory, this.phase === 'complete'),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.disposableResources.forEach((r) => r.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
