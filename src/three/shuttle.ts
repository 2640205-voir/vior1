import * as THREE from 'three';
import { SHUTTLE_MATERIALS } from '../game/materials';
import type { MaterialId } from '../types/game';

export interface ShuttleAssembly {
  root: THREE.Group;
  orbiterGroup: THREE.Group;
  launchStackGroup: THREE.Group;
  landingGearGroup: THREE.Group;
  hatchDoor: THREE.Mesh;
  rampMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  flameCones: THREE.Mesh[];
  landingThrusters: THREE.Mesh[];
  hullMaterial: THREE.MeshPhysicalMaterial;
  setMaterial: (id: MaterialId) => void;
  setGearDeployment: (t: number) => void;
  setHatchOpen: (t: number) => void;
  setThrustLevel: (level: number, boost: boolean, time: number) => void;
  setLandingThrusterLevel: (level: number, time: number) => void;
  setLaunchStackVisible: (visible: boolean) => void;
  setShieldFlash: (intensity: number) => void;
  dispose: () => void;
}

export function createSpaceShuttle(
  brushedBumpMap: THREE.Texture,
  thermalTileMap: THREE.Texture,
  isSoftwareGl: boolean
): ShuttleAssembly {
  const root = new THREE.Group();
  const orbiterGroup = new THREE.Group();
  root.add(orbiterGroup);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // Primary selectable exterior material
  const initialSpec = SHUTTLE_MATERIALS.TITANIUM;
  const hullMaterial = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: initialSpec.colorHex,
      metalness: initialSpec.metalness,
      roughness: initialSpec.roughness,
      clearcoat: initialSpec.clearcoat,
      clearcoatRoughness: 0.18,
      anisotropy: isSoftwareGl ? 0 : initialSpec.anisotropy,
      envMapIntensity: initialSpec.envMapIntensity,
      bumpMap: brushedBumpMap,
      bumpScale: 0.015,
    })
  );

  // Secondary contrasting aerospace materials
  const tileMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: thermalTileMap,
      roughness: 0.86,
      metalness: 0.1,
    })
  );

  const carbonEdgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.65,
      metalness: 0.28,
    })
  );

  const canopyGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1628,
      metalness: 0.25,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.8,
    })
  );

  const nozzleMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x333b48,
      metalness: 0.88,
      roughness: 0.34,
    })
  );

  const accentBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.4,
      metalness: 0.2,
    })
  );

  const accentRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.42,
      metalness: 0.15,
    })
  );

  // 1. Main Cylindrical Fuselage (aligned along Z: nose at -Z, tail at +Z)
  const bodyGeo = trackGeo(new THREE.CylinderGeometry(0.86, 0.92, 4.6, 28));
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, hullMaterial);
  bodyMesh.scale.set(1.06, 0.9, 1);
  bodyMesh.position.set(0, 0.05, 0.35);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  orbiterGroup.add(bodyMesh);

  // 2. Sculpted Nose Cone via LatheGeometry pointing toward -Z
  const noseProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 2.2),
    new THREE.Vector2(0.18, 2.05),
    new THREE.Vector2(0.42, 1.55),
    new THREE.Vector2(0.68, 0.85),
    new THREE.Vector2(0.84, 0.15),
    new THREE.Vector2(0.86, 0.0),
  ];
  const noseGeo = trackGeo(new THREE.LatheGeometry(noseProfile, 28));
  noseGeo.rotateX(-Math.PI / 2); // Tip points toward -Z
  const noseMesh = new THREE.Mesh(noseGeo, hullMaterial);
  noseMesh.scale.set(1.04, 0.88, 1);
  noseMesh.position.set(0, 0.02, -1.94);
  noseMesh.castShadow = true;
  noseMesh.receiveShadow = true;
  orbiterGroup.add(noseMesh);

  // RCC Nose Cap (dark heat-resistant carbon tip)
  const noseCapGeo = trackGeo(new THREE.SphereGeometry(0.24, 18, 14));
  const noseCapMesh = new THREE.Mesh(noseCapGeo, carbonEdgeMat);
  noseCapMesh.scale.set(1.0, 0.85, 1.45);
  noseCapMesh.position.set(0, -0.02, -4.05);
  orbiterGroup.add(noseCapMesh);

  // 3. Lower Thermal Protection Belly Shield
  const bellyGeo = trackGeo(new THREE.BoxGeometry(1.75, 0.18, 5.1));
  const bellyMesh = new THREE.Mesh(bellyGeo, tileMat);
  bellyMesh.position.set(0, -0.68, 0.25);
  bellyMesh.castShadow = true;
  bellyMesh.receiveShadow = true;
  orbiterGroup.add(bellyMesh);

  // 4. Cockpit Crew Cabin & Armored Windshield Canopy
  const cabinGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.78, 1.45, 20));
  cabinGeo.rotateX(Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, hullMaterial);
  cabinMesh.scale.set(1.0, 0.78, 1);
  cabinMesh.position.set(0, 0.56, -1.65);
  cabinMesh.castShadow = true;
  orbiterGroup.add(cabinMesh);

  const visorGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.34, 0.75));
  const visorMesh = new THREE.Mesh(visorGeo, canopyGlassMat);
  visorMesh.position.set(0, 0.68, -2.18);
  visorMesh.rotation.x = 0.42;
  orbiterGroup.add(visorMesh);

  // 5. Payload Bay Dorsal Spine & Doors (aligned symmetrically along Z)
  const payloadBayGeo = trackGeo(new THREE.CylinderGeometry(0.74, 0.78, 3.25, 22, 1, false, -Math.PI * 0.5, Math.PI));
  payloadBayGeo.rotateZ(Math.PI / 2);
  payloadBayGeo.rotateY(Math.PI / 2);
  const payloadBayMesh = new THREE.Mesh(payloadBayGeo, hullMaterial);
  payloadBayMesh.position.set(0, 0.28, 0.55);
  payloadBayMesh.scale.set(0.96, 0.85, 1);
  payloadBayMesh.castShadow = true;
  orbiterGroup.add(payloadBayMesh);

  // Dorsal payload bay center seam & hinge accent
  const spineSeamGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.08, 3.15));
  const spineSeam = new THREE.Mesh(spineSeamGeo, carbonEdgeMat);
  spineSeam.position.set(0, 0.92, 0.55);
  orbiterGroup.add(spineSeam);

  // Crew Access Hatch (Starboard side) & Deployable Ramp
  const hatchGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.75, 0.65));
  const hatchDoor = new THREE.Mesh(hatchGeo, hullMaterial);
  hatchDoor.position.set(0.84, 0.15, -0.95);
  orbiterGroup.add(hatchDoor);

  const rampGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.08, 2.2));
  rampGeo.translate(0, 0, 1.1);
  const rampMesh = new THREE.Mesh(rampGeo, carbonEdgeMat);
  rampMesh.position.set(0.9, -0.45, -0.95);
  rampMesh.rotation.y = Math.PI / 2;
  rampMesh.visible = false;
  orbiterGroup.add(rampMesh);

  // 6. Double-Delta Wings via ExtrudeGeometry with bevels
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.65, -1.55); // leading root near nose
  wingShape.lineTo(1.28, -0.35); // strake inflection
  wingShape.lineTo(3.25, 1.85); // wingtip leading edge
  wingShape.lineTo(3.25, 2.48); // wingtip trailing edge
  wingShape.lineTo(0.78, 2.38); // wing root trailing
  wingShape.closePath();

  const wingGeo = trackGeo(
    new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
  );
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, hullMaterial);
  rightWing.position.set(0, -0.46, 0.2);
  rightWing.castShadow = true;
  rightWing.receiveShadow = true;
  orbiterGroup.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, hullMaterial);
  leftWing.scale.x = -1;
  leftWing.position.set(0, -0.46, 0.2);
  leftWing.castShadow = true;
  leftWing.receiveShadow = true;
  orbiterGroup.add(leftWing);

  // Wing leading edge thermal carbon strips aligned accurately along outer delta sweep (1.28,-0.35) -> (3.25,1.85)
  const edgeLen = Math.hypot(3.25 - 1.28, 1.85 - (-0.35)); // ~2.95
  const edgeAngle = Math.atan2(3.25 - 1.28, 1.85 - (-0.35)); // ~0.73 rad
  const edgeGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.13, edgeLen));
  const rightEdge = new THREE.Mesh(edgeGeo, carbonEdgeMat);
  rightEdge.position.set((1.28 + 3.25) / 2, -0.52, (-0.35 + 1.85) / 2 + 0.2);
  rightEdge.rotation.y = edgeAngle;
  orbiterGroup.add(rightEdge);

  const leftEdge = new THREE.Mesh(edgeGeo, carbonEdgeMat);
  leftEdge.position.set(-(1.28 + 3.25) / 2, -0.52, (-0.35 + 1.85) / 2 + 0.2);
  leftEdge.rotation.y = -edgeAngle;
  orbiterGroup.add(leftEdge);

  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.72, 0.04, 0.28));
  const rightStripe = new THREE.Mesh(stripeGeo, accentBlueMat);
  rightStripe.position.set(2.3, -0.44, 2.05);
  orbiterGroup.add(rightStripe);

  const leftStripe = new THREE.Mesh(stripeGeo, accentRedMat);
  leftStripe.position.set(-2.3, -0.44, 2.05);
  orbiterGroup.add(leftStripe);

  // 7. Vertical Tail Stabilizer (swept back cleanly)
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(1.5, 0);
  tailShape.lineTo(1.1, 1.95);
  tailShape.lineTo(0.45, 1.95);
  tailShape.closePath();

  const tailGeo = trackGeo(
    new THREE.ExtrudeGeometry(tailShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    })
  );
  tailGeo.rotateY(Math.PI / 2);
  const tailMesh = new THREE.Mesh(tailGeo, hullMaterial);
  tailMesh.position.set(-0.06, 0.65, 2.75);
  tailMesh.castShadow = true;
  orbiterGroup.add(tailMesh);

  const tailTipGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.16, 0.62));
  const tailTip = new THREE.Mesh(tailTipGeo, accentBlueMat);
  tailTip.position.set(0, 2.52, 1.98);
  orbiterGroup.add(tailTip);

  // 8. Twin OMS Pods & 3 RS-25 Main Engine Bells
  const omsGeo = trackGeo(new THREE.CapsuleGeometry(0.3, 1.0, 6, 14));
  omsGeo.rotateX(Math.PI / 2);
  const omsLeft = new THREE.Mesh(omsGeo, hullMaterial);
  omsLeft.position.set(-0.64, 0.42, 2.28);
  orbiterGroup.add(omsLeft);

  const omsRight = new THREE.Mesh(omsGeo, hullMaterial);
  omsRight.position.set(0.64, 0.42, 2.28);
  orbiterGroup.add(omsRight);

  // Aft heatshield bulkhead plate
  const aftBulkheadGeo = trackGeo(new THREE.CylinderGeometry(0.84, 0.88, 0.25, 24));
  aftBulkheadGeo.rotateX(Math.PI / 2);
  const aftBulkhead = new THREE.Mesh(aftBulkheadGeo, carbonEdgeMat);
  aftBulkhead.scale.set(1.04, 0.88, 1);
  aftBulkhead.position.set(0, 0.04, 2.66);
  orbiterGroup.add(aftBulkhead);

  const bellProfile = [
    new THREE.Vector2(0.12, 0.0),
    new THREE.Vector2(0.2, 0.22),
    new THREE.Vector2(0.3, 0.48),
    new THREE.Vector2(0.36, 0.74),
  ];
  const bellGeo = trackGeo(new THREE.LatheGeometry(bellProfile, 18));
  bellGeo.rotateX(Math.PI / 2); // opens toward +Z

  const enginePositions: [number, number, number][] = [
    [0, 0.28, 2.72],
    [-0.4, -0.22, 2.74],
    [0.4, -0.22, 2.74],
  ];

  const flameCones: THREE.Mesh[] = [];
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.22, 1.85, 16, 1, true));
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.92);

  enginePositions.forEach(([ex, ey, ez]) => {
    const bell = new THREE.Mesh(bellGeo, nozzleMetalMat);
    bell.position.set(ex, ey, ez);
    orbiterGroup.add(bell);

    const flameMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(ex, ey, ez + 0.68);
    flameCones.push(flame);
    orbiterGroup.add(flame);
  });

  // Landing thrusters (pointing downward -Y for Mission 3)
  const landingThrusters: THREE.Mesh[] = [];
  const lFlameGeo = trackGeo(new THREE.ConeGeometry(0.24, 1.5, 12, 1, true));
  lFlameGeo.rotateX(Math.PI); // tip down
  lFlameGeo.translate(0, -0.75, 0);

  const thrusterOffsets: [number, number, number][] = [
    [-1.1, -0.68, 0.9],
    [1.1, -0.68, 0.9],
    [0, -0.68, -1.6],
  ];
  thrusterOffsets.forEach(([tx, ty, tz]) => {
    const tMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const cone = new THREE.Mesh(lFlameGeo, tMat);
    cone.position.set(tx, ty, tz);
    cone.visible = false;
    landingThrusters.push(cone);
    orbiterGroup.add(cone);
  });

  // 9. Deployable 3-Point Landing Gear
  const landingGearGroup = new THREE.Group();
  orbiterGroup.add(landingGearGroup);

  const strutMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 })
  );
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.35, roughness: 0.7 })
  );

  const strutGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.07, 1.0, 10));
  const padGeo = trackGeo(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 14));

  const gearCoords: [number, number, number][] = [
    [0, -0.65, -2.0],
    [-1.25, -0.58, 1.15],
    [1.25, -0.58, 1.15],
  ];

  const gearAssemblies: THREE.Group[] = [];
  gearCoords.forEach(([gx, gy, gz]) => {
    const leg = new THREE.Group();
    leg.position.set(gx, gy, gz);
    const strut = new THREE.Mesh(strutGeo, strutMat);
    strut.position.y = -0.5;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -1.0;
    leg.add(strut);
    leg.add(pad);
    landingGearGroup.add(leg);
    gearAssemblies.push(leg);
  });
  landingGearGroup.visible = false;

  // 10. Mission 1 Launch Stack (External Fuel Tank + Twin SRBs mounted beneath belly -Y)
  const launchStackGroup = new THREE.Group();
  root.add(launchStackGroup);

  const etMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2592b,
      roughness: 0.72,
      metalness: 0.08,
    })
  );
  const srbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.25,
    })
  );

  // External Tank (offset beneath belly -Y so orbiter remains in full view)
  const etBodyGeo = trackGeo(new THREE.CylinderGeometry(0.98, 0.98, 6.2, 24));
  etBodyGeo.rotateX(Math.PI / 2);
  const etBody = new THREE.Mesh(etBodyGeo, etMat);
  etBody.position.set(0, -1.95, 0.05);
  etBody.castShadow = true;
  launchStackGroup.add(etBody);

  const etNoseGeo = trackGeo(new THREE.ConeGeometry(0.98, 2.0, 24));
  etNoseGeo.rotateX(-Math.PI / 2);
  const etNose = new THREE.Mesh(etNoseGeo, etMat);
  etNose.position.set(0, -1.95, -4.05);
  launchStackGroup.add(etNose);

  // Twin Solid Rocket Boosters
  const srbBodyGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 5.8, 18));
  srbBodyGeo.rotateX(Math.PI / 2);
  const srbConeGeo = trackGeo(new THREE.ConeGeometry(0.42, 1.1, 18));
  srbConeGeo.rotateX(-Math.PI / 2);
  const srbNozzleGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.48, 0.6, 16));
  srbNozzleGeo.rotateX(Math.PI / 2);

  [-1.48, 1.48].forEach((sx) => {
    const srb = new THREE.Mesh(srbBodyGeo, srbMat);
    srb.position.set(sx, -1.95, 0.45);
    srb.castShadow = true;
    launchStackGroup.add(srb);

    const srbCap = new THREE.Mesh(srbConeGeo, srbMat);
    srbCap.position.set(sx, -1.95, -3.0);
    launchStackGroup.add(srbCap);

    const srbNozzle = new THREE.Mesh(srbNozzleGeo, nozzleMetalMat);
    srbNozzle.position.set(sx, -1.95, 3.6);
    launchStackGroup.add(srbNozzle);
  });

  launchStackGroup.visible = false;

  // 11. Energy Shield Impact Bubble (Mission 2)
  const shieldGeo = trackGeo(new THREE.SphereGeometry(3.85, 24, 18));
  const shieldMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.scale.set(1.0, 0.55, 1.35);
  shieldMesh.visible = false;
  orbiterGroup.add(shieldMesh);

  return {
    root,
    orbiterGroup,
    launchStackGroup,
    landingGearGroup,
    hatchDoor,
    rampMesh,
    shieldMesh,
    flameCones,
    landingThrusters,
    hullMaterial,
    setMaterial(id: MaterialId) {
      const spec = SHUTTLE_MATERIALS[id];
      hullMaterial.color.setHex(spec.colorHex);
      hullMaterial.metalness = spec.metalness;
      hullMaterial.roughness = spec.roughness;
      hullMaterial.clearcoat = spec.clearcoat;
      hullMaterial.envMapIntensity = spec.envMapIntensity;
      if (!isSoftwareGl) {
        hullMaterial.anisotropy = spec.anisotropy;
      }
      hullMaterial.needsUpdate = true;
    },
    setGearDeployment(t: number) {
      const clamped = Math.max(0, Math.min(1, t));
      landingGearGroup.visible = clamped > 0.01;
      gearAssemblies.forEach((g) => {
        g.scale.y = clamped;
        g.rotation.x = (1 - clamped) * 1.25;
      });
    },
    setHatchOpen(t: number) {
      const clamped = Math.max(0, Math.min(1, t));
      hatchDoor.rotation.y = clamped * 1.45;
      hatchDoor.position.x = 0.84 + clamped * 0.25;
      rampMesh.visible = clamped > 0.25;
      if (rampMesh.visible) {
        const rt = (clamped - 0.25) / 0.75;
        rampMesh.rotation.x = 0.55 * rt;
        rampMesh.scale.z = rt;
      }
    },
    setThrustLevel(level: number, boost: boolean, time: number) {
      const clamped = Math.max(0, Math.min(1.8, level));
      flameCones.forEach((cone, idx) => {
        const mat = cone.material as THREE.MeshBasicMaterial;
        if (clamped <= 0.02) {
          cone.visible = false;
          return;
        }
        cone.visible = true;
        const flicker = 0.88 + Math.sin(time * 36 + idx * 2.1) * 0.14;
        const lenScale = (0.35 + clamped * 0.95) * (boost ? 1.55 : 1.0) * flicker;
        const radScale = (0.65 + clamped * 0.45) * (boost ? 1.28 : 1.0);
        cone.scale.set(radScale, radScale, lenScale);
        mat.color.setHex(boost ? 0x7dd3fc : clamped > 0.9 ? 0xfb923c : 0x38bdf8);
        mat.opacity = Math.min(0.95, 0.25 + clamped * 0.6);
      });
    },
    setLandingThrusterLevel(level: number, time: number) {
      const clamped = Math.max(0, Math.min(1, level));
      landingThrusters.forEach((cone, idx) => {
        const mat = cone.material as THREE.MeshBasicMaterial;
        if (clamped <= 0.02) {
          cone.visible = false;
          return;
        }
        cone.visible = true;
        const flicker = 0.85 + Math.sin(time * 32 + idx * 1.7) * 0.15;
        cone.scale.set(0.7 + clamped * 0.4, (0.3 + clamped * 0.8) * flicker, 0.7 + clamped * 0.4);
        mat.opacity = clamped * 0.78;
      });
    },
    setLaunchStackVisible(visible: boolean) {
      launchStackGroup.visible = visible;
    },
    setShieldFlash(intensity: number) {
      const mat = shieldMesh.material as THREE.MeshBasicMaterial;
      if (intensity <= 0.01) {
        shieldMesh.visible = false;
        return;
      }
      shieldMesh.visible = true;
      mat.opacity = Math.min(0.8, intensity);
      mat.color.setHex(intensity > 0.45 ? 0xf87171 : 0x38bdf8);
    },
    dispose() {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}
