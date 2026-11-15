import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { SpaceAudioEngine } from '../game/audio';
import { SHUTTLE_MATERIALS } from '../game/materials';
import {
  applyShieldHit,
  checkSphereCollision,
  createInitialFlightState,
  createInitialLaunchState,
  lunarTerrainHeight,
  MISSION2_DURATION_SEC,
  MOON_INITIAL_DISTANCE_KM,
  stepLaunchPhysics,
  stepShuttleFlight,
  type FlightKinematicsState,
  type LaunchPhysicsState,
} from '../game/physics';
import type {
  CompletedMissionStats,
  FlightInputState,
  GameScreen,
  GraphicsQuality,
  LandingPhase,
  MaterialId,
  Mission1Telemetry,
  Mission2Telemetry,
  Mission3Telemetry,
} from '../types/game';
import { createAstronaut, type AstronautRig } from './astronauts';
import { createSpaceEnvironment, type SpaceEnvironment } from './environment';
import { ObstaclePool } from './obstacles';
import { PooledParticleSystem } from './particles';
import { createSpaceShuttle, type ShuttleAssembly } from './shuttle';
import {
  createAsteroidTextures,
  createBrushedMetalTexture,
  createContactShadowTexture,
  createEarthTextures,
  createMoonTextures,
  createParticleTexture,
  createThermalTileTexture,
} from './textures';

export interface EngineCallbacks {
  onLoadingProgress: (pct: number) => void;
  onLoadingComplete: () => void;
  onMission1Telemetry: (t: Mission1Telemetry) => void;
  onMission1Complete: () => void;
  onMission1Failed: () => void;
  onMission2Telemetry: (t: Mission2Telemetry) => void;
  onMission2Complete: (stats: CompletedMissionStats) => void;
  onMission2Failed: () => void;
  onMission3Telemetry: (t: Mission3Telemetry) => void;
  onMission3Complete: (stats: CompletedMissionStats) => void;
}

const _camTargetPos = new THREE.Vector3();
const _camLookAtPos = new THREE.Vector3();

export class SpaceGameEngine {
  private readonly container: HTMLElement;
  private readonly audio: SpaceAudioEngine;
  private readonly callbacks: EngineCallbacks;

  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;

  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly enginePointLight: THREE.PointLight;

  private readonly env: SpaceEnvironment;
  private readonly shuttle: ShuttleAssembly;
  private readonly particles: PooledParticleSystem;
  private readonly obstacles: ObstaclePool;
  private readonly turntableGroup: THREE.Group;
  private readonly astronaut1: AstronautRig;
  private readonly astronaut2: AstronautRig;
  private readonly plantedFlagGroup: THREE.Group;
  private readonly disposableResources: Array<{ dispose: () => void }> = [];

  private screen: GameScreen = 'loading';
  private paused = false;
  private selectedMaterial: MaterialId = 'TITANIUM';
  private quality: GraphicsQuality = 'high';

  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private elapsedTotal = 0;
  private hudSyncAccum = 0;
  private trauma = 0;
  private shieldFlash = 0;
  private damageFlashNonce = 0;

  // Loading state
  private loadingElapsed = 0;
  private readonly loadingDuration = 1.55;
  private loadingCompleted = false;

  // Mission 1 state
  private launchState: LaunchPhysicsState = createInitialLaunchState(SHUTTLE_MATERIALS.TITANIUM);
  private smokeAccum = 0;

  // Mission 2 state
  private flightState: FlightKinematicsState = createInitialFlightState();
  private readonly flightInput: FlightInputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
  };
  private flightExhaustAccum = 0;

  // Mission 3 state
  private landingTimer = 0;
  private landingPhase: LandingPhase = 'approach';
  private stepSoundAccum = 0;
  private dustAccum = 0;
  private flagPlanted = false;
  private lastCompletedFlightSec = MISSION2_DURATION_SEC;
  private lastObstaclesAvoided = 0;
  private lastShieldHitsTaken = 0;
  private landingTimeline: gsap.core.Timeline | null = null;

  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    audio: SpaceAudioEngine,
    callbacks: EngineCallbacks,
    initialQuality: GraphicsQuality,
    initialMaterial: MaterialId
  ) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;
    this.quality = initialQuality;
    this.selectedMaterial = initialMaterial;

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

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.applyQualitySettings(initialQuality);

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030712);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    this.disposableResources.push(envTarget);

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.1, 900);
    this.camera.position.set(0, 3.2, 12);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 6.5;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = Math.PI * 0.65;
    this.controls.enabled = false;

    // 3-Point Space & Planetary Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.55);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    this.keyLight.position.set(18, 24, 16);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 90;
    const d = 18;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    this.rimLight.position.set(-16, 8, -18);
    this.scene.add(this.rimLight);

    this.enginePointLight = new THREE.PointLight(0xfb923c, 0, 26, 1.5);
    this.scene.add(this.enginePointLight);

    // Generate Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const earthMaps = createEarthTextures(maxAniso);
    const moonMaps = createMoonTextures(maxAniso);
    const brushedMap = createBrushedMetalTexture();
    const tileMap = createThermalTileTexture(maxAniso);
    const rockMaps = createAsteroidTextures(maxAniso);
    const particleTex = createParticleTexture();
    const contactShadowTex = createContactShadowTexture();
    this.disposableResources.push(
      earthMaps.map,
      earthMaps.cloudsMap,
      earthMaps.bumpMap,
      moonMaps.map,
      moonMaps.bumpMap,
      brushedMap,
      tileMap,
      rockMaps.map,
      rockMaps.bumpMap,
      particleTex,
      contactShadowTex
    );

    // Build World Objects
    this.env = createSpaceEnvironment(earthMaps, moonMaps, contactShadowTex, particleTex);
    this.scene.add(
      this.env.starFieldGroup,
      this.env.earthGroup,
      this.env.distantMoon,
      this.env.distantPlanetsGroup,
      this.env.launchPadGroup,
      this.env.lunarTerrainGroup
    );

    this.shuttle = createSpaceShuttle(brushedMap, tileMap, this.isSoftwareGl);
    this.shuttle.setMaterial(this.selectedMaterial);
    this.scene.add(this.shuttle.root);

    // Customization Turntable Platform
    this.turntableGroup = this.buildTurntable();
    this.turntableGroup.visible = false;
    this.scene.add(this.turntableGroup);

    // Pooled Particles & Obstacles
    this.particles = new PooledParticleSystem(particleTex, 950);
    this.scene.add(this.particles.points);

    this.obstacles = new ObstaclePool(rockMaps.map, rockMaps.bumpMap, 26);
    this.obstacles.group.visible = false;
    this.scene.add(this.obstacles.group);

    // Astronauts & Planted Flag for Mission 3
    this.astronaut1 = createAstronaut(true);
    this.astronaut2 = createAstronaut(false);
    this.astronaut1.group.visible = false;
    this.astronaut2.group.visible = false;
    this.scene.add(this.astronaut1.group, this.astronaut2.group);

    this.plantedFlagGroup = new THREE.Group();
    this.plantedFlagGroup.visible = false;
    this.scene.add(this.plantedFlagGroup);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.setupLoadingScene();
    this.lastTimeMs = performance.now();
    this.scheduleNextTick();
  }

  private buildTurntable(): THREE.Group {
    const group = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(5.2, 5.8, 0.45, 48);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.78,
      roughness: 0.34,
    });
    const ringGeo = new THREE.TorusGeometry(5.15, 0.08, 12, 64);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -1.6;
    base.receiveShadow = true;

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -1.36;

    group.add(base, ring);
    this.disposableResources.push(baseGeo, baseMat, ringGeo, ringMat);
    return group;
  }

  private applyQualitySettings(quality: GraphicsQuality): void {
    this.quality = quality;
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      return;
    }
    const maxDpr = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  public setQuality(quality: GraphicsQuality): void {
    this.applyQualitySettings(quality);
    this.handleResize();
  }

  public setMaterial(id: MaterialId): void {
    this.selectedMaterial = id;
    this.shuttle.setMaterial(id);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.audio.setPaused(paused);
    if (this.landingTimeline) {
      if (paused) this.landingTimeline.pause();
      else this.landingTimeline.play();
    }
  }

  public setFlightInput(partial: Partial<FlightInputState>): void {
    Object.assign(this.flightInput, partial);
  }

  public clearFlightInput(): void {
    this.flightInput.left = false;
    this.flightInput.right = false;
    this.flightInput.up = false;
    this.flightInput.down = false;
    this.flightInput.boost = false;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private resetAllSceneVisibility(): void {
    this.landingTimeline?.kill();
    this.landingTimeline = null;

    this.turntableGroup.visible = false;
    this.env.launchPadGroup.visible = false;
    this.env.lunarTerrainGroup.visible = false;
    this.env.distantMoon.visible = false;
    this.env.distantPlanetsGroup.visible = false;
    this.env.earthGroup.visible = false;
    this.env.starFieldGroup.visible = true;

    this.obstacles.group.visible = false;
    this.obstacles.reset();
    this.particles.clear();

    this.shuttle.setLaunchStackVisible(false);
    this.shuttle.setGearDeployment(0);
    this.shuttle.setHatchOpen(0);
    this.shuttle.setShieldFlash(0);
    this.shuttle.setLandingThrusterLevel(0, 0);
    this.shuttle.setThrustLevel(0, false, 0);
    this.shuttle.root.visible = true;
    this.shuttle.root.rotation.set(0, 0, 0);
    this.shuttle.root.position.set(0, 0, 0);
    this.shuttle.orbiterGroup.rotation.set(0, 0, 0);

    this.astronaut1.group.visible = false;
    this.astronaut2.group.visible = false;
    this.plantedFlagGroup.visible = false;
    if (this.astronaut1.flagPoleGroup && this.astronaut1.flagPoleGroup.parent !== this.astronaut1.group) {
      this.astronaut1.flagPoleGroup.position.set(0.4, 0, 0.25);
      this.astronaut1.group.add(this.astronaut1.flagPoleGroup);
    }

    this.controls.enabled = false;
    this.enginePointLight.intensity = 0;
    this.trauma = 0;
    this.scene.fog = null;
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
  }

  public setupLoadingScene(): void {
    this.screen = 'loading';
    this.loadingElapsed = 0;
    this.loadingCompleted = false;
    this.resetAllSceneVisibility();

    this.env.earthGroup.visible = true;
    this.env.earthGroup.position.set(-28, -12, -72);
    this.env.earthGroup.scale.setScalar(1.0);

    // Shuttle starts further back and moves smoothly into center at 100%
    this.shuttle.root.position.set(0, -0.3, 12);
    this.shuttle.root.rotation.set(0.08, -0.45, 0.05);
    this.camera.position.set(5.2, 2.2, 10.5);
    this.camera.lookAt(0, 0, 0);
  }

  public enterMainMenu(): void {
    this.screen = 'menu';
    this.audio.stopEngineLoop();
    this.resetAllSceneVisibility();

    this.env.earthGroup.visible = true;
    this.env.earthGroup.position.set(16, -20, -86);
    this.env.earthGroup.scale.setScalar(1.05);

    this.env.distantMoon.visible = true;
    this.env.distantMoon.position.set(38, 22, -135);
    this.env.distantMoon.scale.setScalar(0.5);

    this.shuttle.root.position.set(2.4, -0.1, 0);
    this.shuttle.root.rotation.set(0.1, -0.58, 0.06);
    this.camera.position.set(0, 2.1, 10.5);
    this.camera.lookAt(0.5, 0, 0);
  }

  public enterCustomization(): void {
    this.screen = 'customization';
    this.audio.stopEngineLoop();
    this.resetAllSceneVisibility();

    this.env.earthGroup.visible = true;
    this.env.earthGroup.position.set(-48, -18, -95);
    this.env.earthGroup.scale.setScalar(0.85);

    this.turntableGroup.visible = true;
    this.shuttle.root.position.set(0, 0.15, 0);
    this.shuttle.root.rotation.set(0, 0.45, 0);

    this.camera.position.set(6.8, 3.3, 8.2);
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = true;
    this.controls.update();
  }

  public startMission1(): void {
    this.screen = 'mission1';
    this.resetAllSceneVisibility();
    this.audio.init();
    this.audio.playIgnitionBurst();
    this.audio.startEngineLoop(0.32, 240);

    this.launchState = createInitialLaunchState(SHUTTLE_MATERIALS[this.selectedMaterial]);
    this.smokeAccum = 0;

    // Launch pad visible, stars emerge as shuttle climbs out of atmosphere
    this.env.launchPadGroup.visible = true;
    this.env.setSkyTransition(0);
    this.env.starFieldGroup.visible = false;

    this.env.earthGroup.visible = false;
    this.env.earthGroup.position.set(0, -48, -10);
    this.env.earthGroup.scale.setScalar(1.4);

    // Shuttle upright on launch pad (nose pointing +Y)
    this.shuttle.setLaunchStackVisible(true);
    this.shuttle.root.rotation.set(Math.PI / 2, 0, 0);
    this.shuttle.root.position.set(0, 3.2, 0);

    this.camera.position.set(12.5, 4.2, 16.5);
    this.camera.lookAt(0, 3.8, 0);
  }

  public startMission2(): void {
    this.screen = 'mission2';
    this.resetAllSceneVisibility();
    this.clearFlightInput();
    this.audio.startAmbient();
    this.audio.startEngineLoop(0.18, 300);

    this.flightState = createInitialFlightState();
    this.damageFlashNonce = 0;
    this.shieldFlash = 0;

    // Earth behind shuttle (+Z), Moon ahead (-Z)
    this.env.earthGroup.visible = true;
    this.env.earthGroup.position.set(-18, -12, 85);
    this.env.earthGroup.scale.setScalar(0.9);

    this.env.distantMoon.visible = true;
    this.env.distantMoon.position.set(0, 4, -260);
    this.env.distantMoon.scale.setScalar(0.55);

    this.env.distantPlanetsGroup.visible = true;
    this.obstacles.group.visible = true;
    this.obstacles.reset();

    // Shuttle nose points strictly toward -Z (Moon & flight direction)
    this.shuttle.root.position.set(0, 0, 0);
    this.shuttle.root.rotation.set(0, 0, 0);

    this.camera.position.set(0, 3.0, 11.2);
    this.camera.lookAt(0, 0.5, -18);
  }

  public startMission3(stats?: Partial<CompletedMissionStats>): void {
    this.screen = 'mission3';
    this.resetAllSceneVisibility();
    this.audio.startAmbient();
    this.audio.startEngineLoop(0.22, 380);

    if (stats?.flightDurationSec) this.lastCompletedFlightSec = stats.flightDurationSec;
    if (typeof stats?.obstaclesAvoided === 'number') this.lastObstaclesAvoided = stats.obstaclesAvoided;
    if (typeof stats?.shieldHitsTaken === 'number') this.lastShieldHitsTaken = stats.shieldHitsTaken;

    this.landingTimer = 0;
    this.landingPhase = 'approach';
    this.flagPlanted = false;

    this.env.lunarTerrainGroup.visible = true;
    this.env.earthGroup.visible = true;
    this.env.earthGroup.position.set(-44, 34, -125);
    this.env.earthGroup.scale.setScalar(0.45);

    // Shuttle approaches from high forward-left toward landing pad center (0, 1.68, 0)
    this.shuttle.root.position.set(0, 24, -30);
    this.shuttle.root.rotation.set(-0.18, 0.25, 0);
    this.shuttle.setGearDeployment(0);
    this.shuttle.setHatchOpen(0);

    this.camera.position.set(14, 7.5, 16);
    this.camera.lookAt(0, 8, -10);

    this.runMission3Timeline();
  }

  private runMission3Timeline(): void {
    const landingY = lunarTerrainHeight(0, 0) + 1.68; // Exact gear pad flush contact
    const gearObj = { t: 0 };
    const hatchObj = { t: 0 };
    const thrustObj = { main: 0.65, landing: 0.2 };

    const tl = gsap.timeline();
    this.landingTimeline = tl;

    // 1. Approach & Gear Deployment
    tl.to(this.shuttle.root.position, {
      x: 0,
      y: 8.5,
      z: -3,
      duration: 3.4,
      ease: 'power2.out',
      onUpdate: () => {
        this.shuttle.setLandingThrusterLevel(thrustObj.landing, this.elapsedTotal);
        this.shuttle.setThrustLevel(thrustObj.main, false, this.elapsedTotal);
      },
    }, 0)
      .to(this.shuttle.root.rotation, {
        x: 0.08,
        y: 0.28,
        z: 0,
        duration: 3.2,
        ease: 'power2.out',
      }, 0)
      .to(gearObj, {
        t: 1,
        duration: 1.6,
        ease: 'power2.inOut',
        onUpdate: () => this.shuttle.setGearDeployment(gearObj.t),
      }, 1.4)
      .to(thrustObj, {
        main: 0.1,
        landing: 0.92,
        duration: 1.5,
      }, 1.8)

      // 2. Smooth Vertical Descent to Flush Touchdown
      .add(() => {
        this.landingPhase = 'descent';
        this.audio.updateEngineLoop(0.28, 460);
      }, 3.2)
      .to(this.shuttle.root.position, {
        x: 0,
        y: landingY,
        z: 0,
        duration: 3.8,
        ease: 'power3.out',
        onUpdate: () => {
          this.shuttle.setLandingThrusterLevel(thrustObj.landing, this.elapsedTotal);
          this.shuttle.setThrustLevel(thrustObj.main, false, this.elapsedTotal);
          // Emit radial lunar dust when near surface
          if (this.shuttle.root.position.y < 6.5) {
            this.spawnLunarDustRing(0, 0.15, 0, 4);
          }
        },
      }, 3.4)
      .to(this.shuttle.root.rotation, {
        x: 0,
        y: 0.25,
        z: 0,
        duration: 2.2,
        ease: 'power2.out',
      }, 4.0)
      .to(thrustObj, {
        main: 0,
        landing: 0,
        duration: 0.7,
        onUpdate: () => {
          this.shuttle.setLandingThrusterLevel(thrustObj.landing, this.elapsedTotal);
          this.shuttle.setThrustLevel(thrustObj.main, false, this.elapsedTotal);
        },
      }, 6.7)

      // 3. Touchdown
      .add(() => {
        this.landingPhase = 'touchdown';
        this.audio.stopEngineLoop();
        this.audio.playTouchdown();
        this.trauma = 0.25;
        this.spawnLunarDustRing(0, 0.15, 0, 26);
      }, 7.2)

      // 4. Open Hatch & Ramp
      .add(() => {
        this.landingPhase = 'hatch_open';
      }, 8.1)
      .to(hatchObj, {
        t: 1,
        duration: 1.4,
        ease: 'power2.inOut',
        onUpdate: () => this.shuttle.setHatchOpen(hatchObj.t),
      }, 8.1)

      // 5. Two Astronauts Exit & Walk Forward
      .add(() => {
        this.landingPhase = 'astronaut_walk';
        this.astronaut1.group.visible = true;
        this.astronaut2.group.visible = true;
        this.astronaut1.group.position.set(1.7, 0, -0.8);
        this.astronaut2.group.position.set(2.3, 0, -1.6);
        this.astronaut1.group.rotation.y = 0.2;
        this.astronaut2.group.rotation.y = 0.15;
      }, 9.5)
      .to(this.astronaut1.group.position, {
        x: 2.8,
        z: 4.8,
        duration: 4.0,
        ease: 'none',
        onUpdate: () => {
          const t = this.landingTimer;
          this.astronaut1.setWalkCycle(t * 6.2, 0.52);
          const lx = this.astronaut1.group.position.x;
          const lz = this.astronaut1.group.position.z;
          this.astronaut1.group.position.y += lunarTerrainHeight(lx, lz);
        },
      }, 9.5)
      .to(this.astronaut2.group.position, {
        x: 4.1,
        z: 4.1,
        duration: 4.0,
        ease: 'none',
        onUpdate: () => {
          const t = this.landingTimer;
          this.astronaut2.setWalkCycle(t * 6.2 + 1.1, 0.48);
          const lx = this.astronaut2.group.position.x;
          const lz = this.astronaut2.group.position.z;
          this.astronaut2.group.position.y += lunarTerrainHeight(lx, lz);
        },
      }, 9.8)

      // 6. Plant White Flag
      .add(() => {
        this.landingPhase = 'flag_plant';
        this.astronaut1.setWalkCycle(0, 0);
        this.astronaut2.setWalkCycle(0, 0);
        if (this.astronaut1.flagPoleGroup) {
          this.astronaut1.group.remove(this.astronaut1.flagPoleGroup);
          this.plantedFlagGroup.add(this.astronaut1.flagPoleGroup);
          const fx = 3.25;
          const fz = 5.1;
          this.astronaut1.flagPoleGroup.position.set(0, 0, 0);
          this.plantedFlagGroup.position.set(fx, lunarTerrainHeight(fx, fz), fz);
          this.plantedFlagGroup.visible = true;
          this.flagPlanted = true;
          this.audio.playFootstep();
        }
      }, 13.9)
      .to(this.astronaut1.group.position, {
        x: 2.4,
        z: 4.4,
        duration: 0.9,
        ease: 'power1.out',
      }, 14.1)

      // 7. Complete Screen Transition
      .add(() => {
        this.landingPhase = 'settled';
        this.screen = 'complete';
        this.audio.playMissionComplete();
        this.callbacks.onMission3Complete({
          material: this.selectedMaterial,
          flightDurationSec: Math.round(this.lastCompletedFlightSec),
          obstaclesAvoided: this.lastObstaclesAvoided,
          shieldHitsTaken: this.lastShieldHitsTaken,
        });
      }, 15.8);
  }

  private spawnLunarDustRing(cx: number, cy: number, cz: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.2 + Math.random() * 5.2;
      this.particles.spawn({
        x: cx + Math.cos(a) * 1.1,
        y: cy,
        z: cz + Math.sin(a) * 1.1,
        vx: Math.cos(a) * spd,
        vy: 0.5 + Math.random() * 1.4,
        vz: Math.sin(a) * spd,
        maxLife: 0.9 + Math.random() * 0.7,
        startSize: 0.8,
        endSize: 2.8,
        r: 0.75,
        g: 0.76,
        b: 0.78,
        drag: 1.8,
        gravityY: -0.9,
      });
    }
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (!this.paused) {
      this.elapsedTotal += dt;
      this.updateScene(dt, rawDt);
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  }

  private updateScene(dt: number, rawDt: number): void {
    this.hudSyncAccum += dt;
    this.particles.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.45);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2.2);
    this.shuttle.setShieldFlash(this.shieldFlash);

    if (this.screen === 'loading') {
      this.updateLoading(Math.min(Math.max(rawDt, 0.001), 0.25));
    } else if (this.screen === 'menu') {
      this.updateMenu(dt);
    } else if (this.screen === 'customization') {
      this.updateCustomization(dt);
    } else if (this.screen === 'mission1') {
      const steps = Math.min(5, Math.max(1, Math.ceil(rawDt / 0.05)));
      const subDt = Math.min(0.05, rawDt / steps);
      for (let i = 0; i < steps; i++) {
        if (this.screen !== 'mission1') break;
        this.updateMission1(subDt);
      }
    } else if (this.screen === 'mission2') {
      const steps = Math.min(5, Math.max(1, Math.ceil(rawDt / 0.05)));
      const subDt = Math.min(0.05, rawDt / steps);
      for (let i = 0; i < steps; i++) {
        if (this.screen !== 'mission2') break;
        this.updateMission2(subDt);
      }
    } else if (this.screen === 'mission3' || this.screen === 'complete') {
      this.updateMission3AndComplete(Math.min(Math.max(rawDt, 0.001), 0.22));
    }
  }

  private updateLoading(dt: number): void {
    this.loadingElapsed += dt;
    const t = Math.min(1, this.loadingElapsed / this.loadingDuration);
    const eased = 1 - Math.pow(1 - t, 3);
    this.shuttle.root.position.z = 12 * (1 - eased);
    this.shuttle.root.position.y = Math.sin(this.elapsedTotal * 2) * 0.08;
    this.shuttle.setThrustLevel(0.45, false, this.elapsedTotal);
    this.env.updateStars(dt, 0.2);

    this.callbacks.onLoadingProgress(Math.round(t * 100));
    if (t >= 1 && !this.loadingCompleted) {
      this.loadingCompleted = true;
      this.callbacks.onLoadingComplete();
    }
  }

  private updateMenu(dt: number): void {
    this.env.updateStars(dt, 0.14);
    this.shuttle.root.position.y = -0.1 + Math.sin(this.elapsedTotal * 1.2) * 0.16;
    this.shuttle.root.rotation.z = 0.06 + Math.sin(this.elapsedTotal * 0.7) * 0.03;
    this.shuttle.setThrustLevel(0.32, false, this.elapsedTotal);
  }

  private updateCustomization(dt: number): void {
    this.env.updateStars(dt, 0);
    // Rotate shuttle gently on display platform unless user is dragging
    this.shuttle.root.rotation.y += dt * 0.35;
    if (this.controls.enabled && !this.isSoftwareGl) {
      this.controls.update();
    }
  }

  private updateMission1(dt: number): void {
    const matSpec = SHUTTLE_MATERIALS[this.selectedMaterial];
    const prevFailed = this.launchState.failed;
    const prevCompleted = this.launchState.completed;

    this.launchState = stepLaunchPhysics(this.launchState, matSpec, dt);
    const s = this.launchState;

    // Position shuttle vertically along launch ascent
    const visualAlt = s.altitudeM * 0.04;
    const vibX = (Math.random() - 0.5) * 0.24 * s.vibration;
    const vibZ = (Math.random() - 0.5) * 0.24 * s.vibration;
    this.shuttle.root.position.set(vibX, 3.2 + visualAlt, vibZ);

    const flameLevel = s.failed ? 0.15 : Math.min(1.6, 0.5 + (s.thrustN / 28_500_000) * 0.9);
    this.shuttle.setThrustLevel(flameLevel, false, this.elapsedTotal);
    this.enginePointLight.position.set(0, 1.5 + visualAlt, 1.2);
    this.enginePointLight.intensity = s.failed ? 0.5 : 4.5 + Math.sin(this.elapsedTotal * 40) * 1.2;

    // Sky transitions from blue atmosphere to deep black space as shuttle climbs
    const spaceMix = THREE.MathUtils.clamp((visualAlt - 28) / 85, 0, 1);
    this.env.setSkyTransition(spaceMix);
    if (spaceMix > 0.35) {
      this.env.starFieldGroup.visible = true;
    }
    if (spaceMix > 0.25) {
      this.env.earthGroup.visible = true;
      this.env.earthGroup.position.set(0, -34 + visualAlt * 0.72, -16);
    }

    // Audio modulation
    this.audio.updateEngineLoop(
      s.failed ? 0.12 : 0.28 + s.vibration * 0.22,
      s.failed ? 140 : 240 + spaceMix * 280
    );

    // Emit launch pad flames & billowing smoke
    this.smokeAccum += dt;
    if (this.smokeAccum >= 0.03) {
      this.smokeAccum = 0;
      const nozzleY = this.shuttle.root.position.y - 3.6;
      const spread = s.failed ? 5.5 : visualAlt < 15 ? 4.2 : 1.4;
      for (let i = 0; i < (s.failed ? 4 : 3); i++) {
        // Dense white/gray smoke
        this.particles.spawn({
          x: (Math.random() - 0.5) * 1.8,
          y: Math.max(-1.6, nozzleY - 0.6),
          z: (Math.random() - 0.5) * 1.8,
          vx: (Math.random() - 0.5) * spread * 2.2,
          vy: visualAlt < 12 ? 0.5 + Math.random() * 1.8 : -8 - Math.random() * 6,
          vz: (Math.random() - 0.5) * spread * 2.2,
          maxLife: visualAlt < 12 ? 1.8 : 0.9,
          startSize: 1.5,
          endSize: visualAlt < 12 ? 5.8 : 3.4,
          r: s.failed ? 0.45 : 0.85,
          g: s.failed ? 0.44 : 0.86,
          b: s.failed ? 0.44 : 0.9,
          drag: 1.4,
        });
      }
      // Bright orange fire core
      this.particles.spawn({
        x: (Math.random() - 0.5) * 0.9,
        y: nozzleY,
        z: (Math.random() - 0.5) * 0.9,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -12 - Math.random() * 6,
        vz: (Math.random() - 0.5) * 1.5,
        maxLife: 0.32,
        startSize: 1.6,
        endSize: 0.4,
        r: 1.0,
        g: 0.58,
        b: 0.18,
        drag: 0.2,
      });
    }

    // Camera follow & atmospheric exit transition
    const shake = s.vibration * 0.16;
    const camTargetY = 4.0 + visualAlt * 0.96;
    const camOffsetZ = 16.5 - spaceMix * 4.5;
    _camTargetPos.set(
      12.5 * (1 - spaceMix * 0.85) + (Math.random() - 0.5) * shake,
      camTargetY + (Math.random() - 0.5) * shake,
      camOffsetZ
    );
    this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-5 * dt));
    _camLookAtPos.set(0, this.shuttle.root.position.y + 1.0, 0);
    this.camera.lookAt(_camLookAtPos);

    if (this.hudSyncAccum >= 0.08) {
      this.hudSyncAccum = 0;
      this.callbacks.onMission1Telemetry({
        phase: s.phase,
        altitudeKm: Number((s.altitudeM / 1000).toFixed(1)),
        velocityMs: Math.round(s.velocityMs),
        fuelPercent: Math.round(s.fuelPercent),
        thrustKn: Math.round(s.thrustN / 1000),
        weightKn: Math.round(s.weightN / 1000),
        vibration: s.vibration,
        failed: s.failed,
      });
    }

    if (!prevFailed && s.failed) {
      this.audio.stopEngineLoop();
      this.audio.playMissionFailed();
      this.callbacks.onMission1Failed();
    } else if (!prevCompleted && s.completed) {
      this.callbacks.onMission1Complete();
    }
  }

  private updateMission2(dt: number): void {
    const matSpec = SHUTTLE_MATERIALS[this.selectedMaterial];
    const prevCompleted = this.flightState.completed;
    const prevFailed = this.flightState.failed;

    this.flightState = stepShuttleFlight(
      this.flightState,
      this.flightInput,
      matSpec,
      dt,
      MISSION2_DURATION_SEC
    );
    const f = this.flightState;
    const progress = f.elapsedSec / MISSION2_DURATION_SEC;

    // Position shuttle & orient nose strictly forward (-Z) with banking roll/pitch
    this.shuttle.root.position.set(f.x, f.y, 0);
    this.shuttle.root.rotation.set(f.pitch, 0, f.roll);

    // Engine thrust & boost visuals
    this.shuttle.setThrustLevel(f.isBoosting ? 1.55 : 0.9, f.isBoosting, this.elapsedTotal);
    this.enginePointLight.position.set(f.x, f.y, 4.2);
    this.enginePointLight.intensity = f.isBoosting ? 5.0 : 2.2;
    this.enginePointLight.color.setHex(f.isBoosting ? 0x38bdf8 : 0x60a5fa);

    this.audio.updateEngineLoop(f.isBoosting ? 0.38 : 0.16, f.isBoosting ? 640 : 290);

    // Star streaks & Earth receding behind + Moon growing larger ahead!
    this.env.updateStars(dt, f.isBoosting ? 2.15 : 1.0);
    this.env.earthGroup.position.z = 85 + progress * 90;
    this.env.distantMoon.position.z = -260 + progress * 175;
    const moonScale = 0.55 + progress * 2.1;
    this.env.distantMoon.scale.setScalar(moonScale);

    // Engine exhaust particle stream
    this.flightExhaustAccum += dt;
    if (this.flightExhaustAccum >= (f.isBoosting ? 0.015 : 0.032)) {
      this.flightExhaustAccum = 0;
      this.particles.spawn({
        x: f.x + (Math.random() - 0.5) * 0.7,
        y: f.y + (Math.random() - 0.5) * 0.4,
        z: 3.4,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        vz: f.isBoosting ? 26 : 14,
        maxLife: f.isBoosting ? 0.42 : 0.35,
        startSize: f.isBoosting ? 1.15 : 0.75,
        endSize: 0.1,
        r: f.isBoosting ? 0.45 : 0.7,
        g: 0.85,
        b: 1.0,
        drag: 0.2,
      });
    }

    // Update obstacles & check sphere collisions
    this.obstacles.update(dt, f.x, f.y, f.isBoosting, progress, () => {
      this.flightState = {
        ...this.flightState,
        obstaclesAvoided: this.flightState.obstaclesAvoided + 1,
      };
    });

    if (!f.failed && !f.completed && f.invulnerableTimer <= 0) {
      for (const item of this.obstacles.items) {
        if (!item.active) continue;
        // Shuttle hit sphere radius ~1.65m
        if (checkSphereCollision(f.x, f.y, 0, 1.65, item.x, item.y, item.z, item.radius)) {
          this.flightState = applyShieldHit(this.flightState);
          this.damageFlashNonce += 1;
          this.shieldFlash = 0.95;
          this.trauma = 0.72;
          this.audio.playImpact();

          // Knock obstacle aside & spawn impact sparks
          item.active = false;
          item.mesh.visible = false;
          for (let k = 0; k < 22; k++) {
            this.particles.spawn({
              x: f.x + (Math.random() - 0.5) * 1.6,
              y: f.y + (Math.random() - 0.5) * 1.2,
              z: -1.0,
              vx: (Math.random() - 0.5) * 16,
              vy: (Math.random() - 0.5) * 16,
              vz: (Math.random() - 0.5) * 12,
              maxLife: 0.55,
              startSize: 0.9,
              endSize: 0.1,
              r: 1.0,
              g: 0.52,
              b: 0.18,
              drag: 1.6,
            });
          }
          break;
        }
      }
    }

    // Smooth third-person chase camera behind shuttle (+Z) looking forward (-Z)
    const boostFov = f.isBoosting ? 64 : 55;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, boostFov, 7, dt);
    this.camera.updateProjectionMatrix();

    const shakeAmp = this.trauma * this.trauma * 0.65 + (f.isBoosting ? 0.05 : 0);
    const sx = (Math.random() - 0.5) * shakeAmp;
    const sy = (Math.random() - 0.5) * shakeAmp;

    _camTargetPos.set(f.x * 0.62 + sx, f.y * 0.62 + 2.8 + sy, 10.8);
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 8, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 8, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 8, dt);
    _camLookAtPos.set(f.x * 0.35, f.y * 0.35 + 0.4, -28);
    this.camera.lookAt(_camLookAtPos);

    if (this.hudSyncAccum >= 0.08 || this.flightState.failed || this.flightState.completed) {
      this.hudSyncAccum = 0;
      const cur = this.flightState;
      const prog = cur.elapsedSec / MISSION2_DURATION_SEC;
      const distKm = Math.max(0, Math.round(MOON_INITIAL_DISTANCE_KM * (1 - prog)));
      const speedKms = Number(((cur.isBoosting ? 14.8 : 10.6) * matSpec.thrustMultiplier).toFixed(1));
      this.callbacks.onMission2Telemetry({
        distanceKm: distKm,
        speedKms,
        shieldHitsRemaining: cur.shieldHitsRemaining,
        maxShieldHits: 3,
        boostPercent: Math.round(cur.boostEnergy),
        isBoosting: cur.isBoosting,
        elapsedSec: Math.round(cur.elapsedSec),
        targetDurationSec: MISSION2_DURATION_SEC,
        progressPercent: Math.min(100, Math.round(prog * 100)),
        obstaclesAvoided: cur.obstaclesAvoided,
        failed: cur.failed,
        damageFlashNonce: this.damageFlashNonce,
      });
    }

    if (!prevFailed && this.flightState.failed) {
      this.audio.stopEngineLoop();
      this.audio.playMissionFailed();
      this.callbacks.onMission2Failed();
    } else if (!prevCompleted && this.flightState.completed) {
      const stats: CompletedMissionStats = {
        material: this.selectedMaterial,
        flightDurationSec: Math.round(this.flightState.elapsedSec),
        obstaclesAvoided: this.flightState.obstaclesAvoided,
        shieldHitsTaken: 3 - this.flightState.shieldHitsRemaining,
      };
      this.callbacks.onMission2Complete(stats);
    }
  }

  private updateMission3AndComplete(dt: number): void {
    this.landingTimer += dt;
    this.env.updateStars(dt, 0);

    if (this.flagPlanted) {
      this.astronaut1.updateFlagWave(this.elapsedTotal);
    }

    if (this.landingPhase === 'astronaut_walk') {
      this.stepSoundAccum += dt;
      this.dustAccum += dt;
      if (this.stepSoundAccum >= 0.55) {
        this.stepSoundAccum = 0;
        this.audio.playFootstep();
      }
      if (this.dustAccum >= 0.18) {
        this.dustAccum = 0;
        this.particles.spawn({
          x: this.astronaut1.group.position.x + (Math.random() - 0.5) * 0.3,
          y: 0.12,
          z: this.astronaut1.group.position.z + (Math.random() - 0.5) * 0.3,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 0.35 + Math.random() * 0.4,
          vz: (Math.random() - 0.5) * 0.8,
          maxLife: 0.75,
          startSize: 0.35,
          endSize: 1.1,
          r: 0.78,
          g: 0.8,
          b: 0.84,
          drag: 1.5,
        });
      }
    }

    // Cinematic camera framing
    if (this.screen === 'complete') {
      const angle = 0.65 + (this.landingTimer - 15.8) * 0.14;
      const radius = 12.8;
      _camTargetPos.set(Math.sin(angle) * radius + 1.5, 4.2, Math.cos(angle) * radius + 2.0);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 3.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 3.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 3.5, dt);
      this.camera.lookAt(1.8, 1.3, 2.5);
    } else if (this.landingPhase === 'approach' || this.landingPhase === 'descent') {
      const shake = this.trauma * this.trauma * 0.35;
      _camTargetPos.set(11.5 + shake, 4.8 + shake, 12.5);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 3, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 3, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 3, dt);
      _camLookAtPos.set(
        this.shuttle.root.position.x,
        Math.max(1.5, this.shuttle.root.position.y),
        this.shuttle.root.position.z
      );
      this.camera.lookAt(_camLookAtPos);
    } else {
      // Focus on landed shuttle + exiting astronauts + flag
      _camTargetPos.set(8.6, 3.1, 11.4);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 3.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 3.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 3.5, dt);
      _camLookAtPos.set(2.0, 1.2, 2.2);
      this.camera.lookAt(_camLookAtPos);
    }

    if (this.hudSyncAccum >= 0.1) {
      this.hudSyncAccum = 0;
      const alt = Math.max(0, Math.round((this.shuttle.root.position.y - 1.68) * 10));
      this.callbacks.onMission3Telemetry({
        phase: this.landingPhase,
        altitudeM: alt,
        verticalSpeedMs: this.landingPhase === 'approach' ? 12 : this.landingPhase === 'descent' ? 4 : 0,
        gearDeployed: this.landingTimer > 2.2,
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.landingTimeline?.kill();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.shuttle.dispose();
    this.env.dispose();
    this.particles.dispose();
    this.obstacles.dispose();
    this.astronaut1.dispose();
    this.astronaut2.dispose();
    this.disposableResources.forEach((r) => r.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
