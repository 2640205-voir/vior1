import * as THREE from 'three';
import { FLIGHT_BOUNDS_X, FLIGHT_BOUNDS_Y } from '../game/physics';

export type ObstacleKind = 'meteorite' | 'asteroid' | 'rock' | 'satellite';

export interface ActiveObstacle {
  active: boolean;
  kind: ObstacleKind;
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  speed: number;
  radius: number;
  rx: number;
  ry: number;
  rz: number;
  scoredAvoided: boolean;
}

export class ObstaclePool {
  public readonly group = new THREE.Group();
  public readonly items: ActiveObstacle[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private spawnTimer = 0;

  constructor(
    rockMap: THREE.Texture,
    rockBump: THREE.Texture,
    poolSize = 26
  ) {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xb8b2a8,
      map: rockMap,
      bumpMap: rockBump,
      bumpScale: 0.14,
      roughness: 0.88,
      metalness: 0.08,
    });
    const meteoriteMat = new THREE.MeshStandardMaterial({
      color: 0x9b7b65,
      map: rockMap,
      bumpMap: rockBump,
      bumpScale: 0.18,
      roughness: 0.72,
      metalness: 0.25,
      emissive: 0x3b1208,
      emissiveIntensity: 0.25,
    });
    const satMetalMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.28,
    });
    const satPanelMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.65,
      roughness: 0.25,
    });
    this.materials.push(rockMat, meteoriteMat, satMetalMat, satPanelMat);

    // Craggy irregular rock geometries
    const astGeo = this.createCraggyGeometry(1.0, 2, 0.32);
    const metGeo = this.createCraggyGeometry(0.85, 1, 0.28);
    const rockGeo = this.createCraggyGeometry(0.9, 1, 0.24);
    const satBodyGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.3, 10);
    const satWingGeo = new THREE.BoxGeometry(2.6, 0.05, 0.75);
    const satDishGeo = new THREE.ConeGeometry(0.42, 0.3, 12, 1, true);
    this.geometries.push(astGeo, metGeo, rockGeo, satBodyGeo, satWingGeo, satDishGeo);

    const kinds: ObstacleKind[] = ['asteroid', 'meteorite', 'rock', 'satellite'];
    for (let i = 0; i < poolSize; i++) {
      const kind = kinds[i % kinds.length];
      let mesh: THREE.Object3D;

      if (kind === 'satellite') {
        const satGroup = new THREE.Group();
        const body = new THREE.Mesh(satBodyGeo, satMetalMat);
        const wing = new THREE.Mesh(satWingGeo, satPanelMat);
        const dish = new THREE.Mesh(satDishGeo, satMetalMat);
        dish.position.y = 0.78;
        satGroup.add(body, wing, dish);
        mesh = satGroup;
      } else if (kind === 'meteorite') {
        mesh = new THREE.Mesh(metGeo, meteoriteMat);
      } else if (kind === 'asteroid') {
        mesh = new THREE.Mesh(astGeo, rockMat);
      } else {
        mesh = new THREE.Mesh(rockGeo, rockMat);
      }

      mesh.visible = false;
      this.group.add(mesh);

      this.items.push({
        active: false,
        kind,
        mesh,
        x: 0,
        y: 0,
        z: -200,
        speed: 35,
        radius: 1.2,
        rx: 0.8,
        ry: 1.0,
        rz: 0.5,
        scoredAvoided: false,
      });
    }
  }

  private createCraggyGeometry(radius: number, detail: number, jitter: number): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n =
        Math.sin(x * 3.7 + y * 2.1) *
        Math.cos(z * 4.3 - x * 1.9);
      const scale = 1 + n * jitter;
      pos.setXYZ(i, x * scale, y * scale, z * scale);
    }
    geo.computeVertexNormals();
    return geo;
  }

  public reset(): void {
    this.spawnTimer = 0.6;
    for (const item of this.items) {
      item.active = false;
      item.mesh.visible = false;
    }
  }

  public update(
    dt: number,
    shuttleX: number,
    shuttleY: number,
    isBoosting: boolean,
    progressRatio: number,
    onAvoided: () => void
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    // Difficulty ramps gently across the 60s flight
    const spawnInterval = Math.max(0.32, 0.72 - progressRatio * 0.34);
    this.spawnTimer -= clampedDt * (isBoosting ? 1.35 : 1.0);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnInterval;
      this.spawnOne(shuttleX, shuttleY, progressRatio);
    }

    const boostMult = isBoosting ? 1.48 : 1.0;

    for (const item of this.items) {
      if (!item.active) continue;

      item.z += item.speed * boostMult * clampedDt;
      item.mesh.position.set(item.x, item.y, item.z);
      item.mesh.rotation.x += item.rx * clampedDt;
      item.mesh.rotation.y += item.ry * clampedDt;
      item.mesh.rotation.z += item.rz * clampedDt;

      // Mark avoided once obstacle passes safely behind shuttle (shuttle is at z=0)
      if (!item.scoredAvoided && item.z > 4.2) {
        item.scoredAvoided = true;
        onAvoided();
      }

      if (item.z > 24) {
        item.active = false;
        item.mesh.visible = false;
      }
    }
  }

  private spawnOne(shuttleX: number, shuttleY: number, progressRatio: number): void {
    const slot = this.items.find((o) => !o.active);
    if (!slot) return;

    slot.active = true;
    slot.scoredAvoided = false;

    // 40% bias toward player's lane so dodging stays engaging, 60% spread across corridor
    const aimPlayer = Math.random() < 0.42;
    const x = aimPlayer
      ? THREE.MathUtils.clamp(shuttleX + (Math.random() - 0.5) * 4.8, -FLIGHT_BOUNDS_X, FLIGHT_BOUNDS_X)
      : (Math.random() * 2 - 1) * (FLIGHT_BOUNDS_X + 1.5);
    const y = aimPlayer
      ? THREE.MathUtils.clamp(shuttleY + (Math.random() - 0.5) * 3.2, -FLIGHT_BOUNDS_Y, FLIGHT_BOUNDS_Y)
      : (Math.random() * 2 - 1) * (FLIGHT_BOUNDS_Y + 1.0);

    const scale =
      slot.kind === 'satellite'
        ? 0.95 + Math.random() * 0.45
        : 0.75 + Math.random() * 1.45;

    slot.x = x;
    slot.y = y;
    slot.z = -155 - Math.random() * 45;
    slot.speed = (36 + Math.random() * 22) * (1 + progressRatio * 0.35);
    slot.radius = scale * (slot.kind === 'satellite' ? 1.15 : 0.92);
    slot.rx = (Math.random() - 0.5) * 2.2;
    slot.ry = (Math.random() - 0.5) * 2.2;
    slot.rz = (Math.random() - 0.5) * 2.2;

    slot.mesh.scale.setScalar(scale);
    slot.mesh.position.set(x, y, slot.z);
    slot.mesh.visible = true;
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
