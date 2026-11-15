import * as THREE from 'three';

export interface AstronautRig {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  flagPoleGroup: THREE.Group | null;
  flagCloth: THREE.Mesh | null;
  setWalkCycle: (phase: number, amplitude: number) => void;
  updateFlagWave: (time: number) => void;
  dispose: () => void;
}

export function createAstronaut(withWhiteFlag: boolean): AstronautRig {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.58,
    metalness: 0.08,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.65,
    metalness: 0.15,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.92,
    roughness: 0.12,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.8,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.45,
    metalness: 0.1,
  });
  mats.push(suitMat, jointMat, visorMat, bootMat, accentMat);

  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.48, 0.56, 0.32);
  geos.push(torsoGeo);
  const torso = new THREE.Mesh(torsoGeo, suitMat);
  torso.position.y = 1.02;
  torso.castShadow = true;
  group.add(torso);

  // Chest control module
  const dcmGeo = new THREE.BoxGeometry(0.24, 0.18, 0.08);
  geos.push(dcmGeo);
  const dcm = new THREE.Mesh(dcmGeo, jointMat);
  dcm.position.set(0, 1.05, 0.18);
  group.add(dcm);

  // PLSS Backpack
  const packGeo = new THREE.BoxGeometry(0.42, 0.52, 0.22);
  geos.push(packGeo);
  const pack = new THREE.Mesh(packGeo, suitMat);
  pack.position.set(0, 1.06, -0.24);
  pack.castShadow = true;
  group.add(pack);

  const stripeGeo = new THREE.BoxGeometry(0.44, 0.06, 0.23);
  geos.push(stripeGeo);
  const stripe = new THREE.Mesh(stripeGeo, accentMat);
  stripe.position.set(0, 1.24, -0.24);
  group.add(stripe);

  // Helmet + Gold Visor
  const helmetGeo = new THREE.SphereGeometry(0.22, 18, 14);
  geos.push(helmetGeo);
  const helmet = new THREE.Mesh(helmetGeo, suitMat);
  helmet.position.set(0, 1.48, 0.02);
  helmet.castShadow = true;
  group.add(helmet);

  const visorGeo = new THREE.SphereGeometry(0.185, 16, 12, -Math.PI * 0.38, Math.PI * 0.76, Math.PI * 0.2, Math.PI * 0.55);
  geos.push(visorGeo);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.48, 0.08);
  visor.rotation.y = Math.PI / 2;
  group.add(visor);

  // Articulated Arms
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.36, 4, 8);
  const gloveGeo = new THREE.SphereGeometry(0.085, 10, 8);
  geos.push(armGeo, gloveGeo);

  const buildArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 1.24, 0);
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.y = -0.22;
    arm.castShadow = true;
    const glove = new THREE.Mesh(gloveGeo, jointMat);
    glove.position.y = -0.46;
    pivot.add(arm, glove);
    group.add(pivot);
    return pivot;
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Articulated Legs + Lunar Boots (bottom at y = 0)
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.42, 4, 8);
  const bootGeo = new THREE.BoxGeometry(0.18, 0.14, 0.28);
  geos.push(legGeo, bootGeo);

  const buildLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.74, 0);
    const leg = new THREE.Mesh(legGeo, suitMat);
    leg.position.y = -0.3;
    leg.castShadow = true;
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.67, 0.04);
    boot.castShadow = true;
    pivot.add(leg, boot);
    group.add(pivot);
    return pivot;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Optional White Flag Pole + Undulating Cloth
  let flagPoleGroup: THREE.Group | null = null;
  let flagCloth: THREE.Mesh | null = null;
  let baseFlagPos: Float32Array | null = null;

  if (withWhiteFlag) {
    flagPoleGroup = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.25,
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    mats.push(poleMat, clothMat);

    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.35, 10);
    const crossbarGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.95, 8);
    crossbarGeo.rotateZ(Math.PI / 2);
    const clothGeo = new THREE.PlaneGeometry(0.92, 0.56, 14, 8);
    geos.push(poleGeo, crossbarGeo, clothGeo);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.175;
    pole.castShadow = true;

    const crossbar = new THREE.Mesh(crossbarGeo, poleMat);
    crossbar.position.set(0.47, 2.28, 0);

    flagCloth = new THREE.Mesh(clothGeo, clothMat);
    flagCloth.position.set(0.47, 1.98, 0);
    flagCloth.castShadow = true;
    baseFlagPos = new Float32Array(clothGeo.attributes.position.array);

    flagPoleGroup.add(pole, crossbar, flagCloth);
    // Start held in astronaut's right hand
    flagPoleGroup.position.set(0.4, 0.0, 0.25);
    group.add(flagPoleGroup);
  }

  return {
    group,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    flagPoleGroup,
    flagCloth,
    setWalkCycle(phase: number, amplitude: number) {
      const swing = Math.sin(phase) * amplitude;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.7;
      rightArm.rotation.x = withWhiteFlag ? -0.45 + swing * 0.25 : swing * 0.7;
      // Subtle vertical stride bob
      group.position.y = Math.abs(Math.cos(phase)) * 0.05 * amplitude;
    },
    updateFlagWave(time: number) {
      if (!flagCloth || !baseFlagPos) return;
      const posAttr = flagCloth.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < posAttr.count; i++) {
        const bx = baseFlagPos[i * 3];
        const by = baseFlagPos[i * 3 + 1];
        // Distance from pole edge (left edge bx = -0.46)
        const dist = Math.max(0, bx + 0.46);
        arr[i * 3 + 2] = Math.sin(dist * 7.5 - time * 3.4 + by * 2.2) * 0.06 * dist;
      }
      posAttr.needsUpdate = true;
      flagCloth.geometry.computeVertexNormals();
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
