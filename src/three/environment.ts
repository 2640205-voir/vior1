import * as THREE from 'three';
import { lunarTerrainHeight } from '../game/physics';

export interface SpaceEnvironment {
  starFieldGroup: THREE.Group;
  earthGroup: THREE.Group;
  earthClouds: THREE.Mesh;
  distantMoon: THREE.Mesh;
  distantPlanetsGroup: THREE.Group;
  launchPadGroup: THREE.Group;
  skyDome: THREE.Mesh;
  lunarTerrainGroup: THREE.Group;
  updateStars: (dt: number, speedMultiplier: number) => void;
  setSkyTransition: (spaceFactor: number) => void;
  dispose: () => void;
}

export function createSpaceEnvironment(
  earthMaps: { map: THREE.Texture; cloudsMap: THREE.Texture; bumpMap: THREE.Texture },
  moonMaps: { map: THREE.Texture; bumpMap: THREE.Texture },
  contactShadowTex: THREE.Texture,
  particleTex: THREE.Texture
): SpaceEnvironment {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  // 1. Deep-Space Starfield (3200 stars with temperature colors)
  const starFieldGroup = new THREE.Group();
  const starCount = 3200;
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    // Spread across large volume around origin
    const r = 120 + Math.random() * 260;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPos[i * 3 + 2] = r * Math.cos(phi);

    const tint = Math.random();
    if (tint < 0.25) {
      // Cool blue-white O/B star
      starColors[i * 3] = 0.72;
      starColors[i * 3 + 1] = 0.86;
      starColors[i * 3 + 2] = 1.0;
    } else if (tint < 0.45) {
      // Warm gold K/G star
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 0.9;
      starColors[i * 3 + 2] = 0.72;
    } else {
      starColors[i * 3] = 0.95;
      starColors[i * 3 + 1] = 0.97;
      starColors[i * 3 + 2] = 1.0;
    }
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.55,
    map: particleTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    alphaTest: 0.02,
    depthWrite: false,
    sizeAttenuation: true,
  });
  geos.push(starGeo);
  mats.push(starMat);
  const stars = new THREE.Points(starGeo, starMat);
  starFieldGroup.add(stars);

  // Moving warp/flight streak stars for Mission 2 speed perception
  const streakCount = 450;
  const streakPos = new Float32Array(streakCount * 3);
  for (let i = 0; i < streakCount; i++) {
    streakPos[i * 3] = (Math.random() - 0.5) * 90;
    streakPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
    streakPos[i * 3 + 2] = -Math.random() * 200;
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.PointsMaterial({
    color: 0xe0f2fe,
    size: 0.72,
    map: particleTex,
    transparent: true,
    opacity: 0.85,
    alphaTest: 0.02,
    depthWrite: false,
  });
  geos.push(streakGeo);
  mats.push(streakMat);
  const flightStreaks = new THREE.Points(streakGeo, streakMat);
  starFieldGroup.add(flightStreaks);

  // Soft radial deep-space nebula clouds (zero rectangular quad edges)
  const nebulaColors = [0x0ea5e9, 0x4338ca, 0x0891b2];
  const nebGeo = new THREE.PlaneGeometry(180, 140);
  geos.push(nebGeo);
  nebulaColors.forEach((hex, idx) => {
    const nebMat = new THREE.MeshBasicMaterial({
      color: hex,
      map: particleTex,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mats.push(nebMat);
    const neb = new THREE.Mesh(nebGeo, nebMat);
    neb.position.set((idx - 1) * 105, 24 - idx * 16, -265 - idx * 18);
    neb.rotation.z = idx * 0.6;
    starFieldGroup.add(neb);
  });

  // 2. Detailed Earth + Cloud Layer + Soft Fresnel Atmospheric Glow
  const earthGroup = new THREE.Group();
  const earthGeo = new THREE.SphereGeometry(28, 48, 36);
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: earthMaps.map,
    bumpMap: earthMaps.bumpMap,
    bumpScale: 0.25,
    roughness: 0.68,
    metalness: 0.08,
  });
  geos.push(earthGeo);
  mats.push(earthMat);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthGroup.add(earthMesh);

  const cloudGeo = new THREE.SphereGeometry(28.35, 42, 32);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: earthMaps.cloudsMap,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    roughness: 0.9,
  });
  geos.push(cloudGeo);
  mats.push(cloudMat);
  const earthClouds = new THREE.Mesh(cloudGeo, cloudMat);
  earthGroup.add(earthClouds);

  const atmoGeo = new THREE.SphereGeometry(30.6, 42, 32);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uGlowColor: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      uniform vec3 uGlowColor;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float ndotv = dot(vNormal, viewDir);
        float limb = pow(clamp(0.55 - ndotv, 0.0, 1.0), 3.4);
        float outerFade = smoothstep(-0.32, 0.12, -ndotv);
        gl_FragColor = vec4(uGlowColor, clamp(limb * outerFade * 1.15, 0.0, 0.72));
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  geos.push(atmoGeo);
  mats.push(atmoMat);
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  earthGroup.add(atmoMesh);

  // 3. Distant Moon (for Mission 2 approach)
  const moonGeo = new THREE.SphereGeometry(18, 48, 36);
  const moonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: moonMaps.map,
    bumpMap: moonMaps.bumpMap,
    bumpScale: 0.4,
    roughness: 0.92,
    metalness: 0.04,
  });
  geos.push(moonGeo);
  mats.push(moonMat);
  const distantMoon = new THREE.Mesh(moonGeo, moonMat);
  distantMoon.visible = false;

  // 4. Distant Planets & Space Objects
  const distantPlanetsGroup = new THREE.Group();
  const saturnGeo = new THREE.SphereGeometry(7, 24, 18);
  const saturnMat = new THREE.MeshStandardMaterial({
    color: 0xd6b484,
    roughness: 0.78,
    metalness: 0.05,
  });
  const ringGeo = new THREE.RingGeometry(9.5, 15.5, 42);
  ringGeo.rotateX(Math.PI / 2.4);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xcbb08c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.58,
    roughness: 0.8,
  });
  const marsGeo = new THREE.SphereGeometry(4.2, 22, 16);
  const marsMat = new THREE.MeshStandardMaterial({
    color: 0xc2593f,
    roughness: 0.85,
    metalness: 0.05,
  });
  geos.push(saturnGeo, ringGeo, marsGeo);
  mats.push(saturnMat, ringMat, marsMat);

  const ringedPlanet = new THREE.Group();
  ringedPlanet.add(new THREE.Mesh(saturnGeo, saturnMat), new THREE.Mesh(ringGeo, ringMat));
  ringedPlanet.position.set(78, 34, -220);

  const redPlanet = new THREE.Mesh(marsGeo, marsMat);
  redPlanet.position.set(-72, -24, -195);
  distantPlanetsGroup.add(ringedPlanet, redPlanet);

  // 5. Mission 1 Launch Pad & Umbilical Tower + Atmospheric Sky Dome
  const launchPadGroup = new THREE.Group();

  const skyGeo = new THREE.SphereGeometry(420, 28, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color(0x0369a1) },
      uHorizonColor: { value: new THREE.Color(0x7dd3fc) },
      uSpaceMix: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform float uSpaceMix;
      void main() {
        float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
        vec3 atmo = mix(uHorizonColor, uTopColor, pow(h, 0.45));
        vec3 space = vec3(0.012, 0.024, 0.06);
        vec3 col = mix(atmo, space, uSpaceMix);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  geos.push(skyGeo);
  mats.push(skyMat);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  launchPadGroup.add(skyDome);

  // Concrete Launch Pad Deck + Flame Trench
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.9,
    metalness: 0.08,
  });
  const padSteelMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.48,
    metalness: 0.72,
  });
  const towerRedMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.55,
    metalness: 0.35,
  });
  const groundApronMat = new THREE.MeshStandardMaterial({
    color: 0x263529,
    roughness: 0.96,
    metalness: 0.02,
  });
  mats.push(concreteMat, padSteelMat, towerRedMat, groundApronMat);

  const groundPlaneGeo = new THREE.CircleGeometry(140, 40);
  groundPlaneGeo.rotateX(-Math.PI / 2);
  const groundApron = new THREE.Mesh(groundPlaneGeo, groundApronMat);
  groundApron.position.y = -4.2;
  groundApron.receiveShadow = true;
  launchPadGroup.add(groundApron);

  const padBaseGeo = new THREE.BoxGeometry(22, 2.2, 22);
  const padBase = new THREE.Mesh(padBaseGeo, concreteMat);
  padBase.position.set(0, -3.1, 0);
  padBase.receiveShadow = true;
  launchPadGroup.add(padBase);

  const trenchGeo = new THREE.BoxGeometry(7.2, 1.4, 14);
  const trench = new THREE.Mesh(trenchGeo, padSteelMat);
  trench.position.set(0, -1.7, 0);
  trench.receiveShadow = true;
  launchPadGroup.add(trench);

  // Launch Umbilical Tower (truss tower beside the shuttle at x = -5.5)
  const towerGroup = new THREE.Group();
  towerGroup.position.set(-5.8, -2.0, -1.0);
  const colGeo = new THREE.BoxGeometry(0.45, 22, 0.45);
  const crossGeo = new THREE.BoxGeometry(3.4, 0.28, 3.4);
  const armGeo = new THREE.BoxGeometry(4.4, 0.32, 0.65);
  const mastGeo = new THREE.CylinderGeometry(0.05, 0.18, 5.5, 8);
  geos.push(groundPlaneGeo, padBaseGeo, trenchGeo, colGeo, crossGeo, armGeo, mastGeo);

  [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ].forEach(([cx, cz]) => {
    const col = new THREE.Mesh(colGeo, towerRedMat);
    col.position.set(cx, 11, cz);
    col.castShadow = true;
    towerGroup.add(col);
  });

  for (let level = 2; level <= 20; level += 3) {
    const brace = new THREE.Mesh(crossGeo, padSteelMat);
    brace.position.y = level;
    towerGroup.add(brace);
  }

  // Crew access & umbilical swing arms
  const upperArm = new THREE.Mesh(armGeo, padSteelMat);
  upperArm.position.set(3.0, 12.2, 0);
  const lowerArm = new THREE.Mesh(armGeo, padSteelMat);
  lowerArm.position.set(3.0, 7.6, 0);
  const lightningMast = new THREE.Mesh(mastGeo, padSteelMat);
  lightningMast.position.set(0, 24.5, 0);
  towerGroup.add(upperArm, lowerArm, lightningMast);
  launchPadGroup.add(towerGroup);

  launchPadGroup.visible = false;

  // 6. Mission 3 Lunar Landing Site Terrain + Instanced Moon Boulders
  const lunarTerrainGroup = new THREE.Group();
  const terrainSize = 180;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 96, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tPos.count; i++) {
    const vx = tPos.getX(i);
    const vz = tPos.getZ(i);
    tPos.setY(i, lunarTerrainHeight(vx, vz));
  }
  terrainGeo.computeVertexNormals();

  // Repeat moon texture across terrain
  const terrainMap = moonMaps.map.clone();
  terrainMap.needsUpdate = true;
  terrainMap.repeat.set(8, 8);
  const terrainBump = moonMaps.bumpMap.clone();
  terrainBump.needsUpdate = true;
  terrainBump.repeat.set(8, 8);

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce3,
    map: terrainMap,
    bumpMap: terrainBump,
    bumpScale: 0.45,
    roughness: 0.94,
    metalness: 0.03,
  });
  geos.push(terrainGeo);
  mats.push(terrainMat);

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  lunarTerrainGroup.add(terrainMesh);

  // Soft radial contact shadow under landed shuttle
  const shadowDiscGeo = new THREE.CircleGeometry(4.2, 24);
  shadowDiscGeo.rotateX(-Math.PI / 2);
  const shadowDiscMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  geos.push(shadowDiscGeo);
  mats.push(shadowDiscMat);
  const shuttleContactShadow = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
  shuttleContactShadow.position.set(0, 0.02, 0);
  lunarTerrainGroup.add(shuttleContactShadow);

  // Instanced Lunar Boulders (60 boulders outside landing pad clear zone)
  const boulderGeo = new THREE.IcosahedronGeometry(0.7, 1);
  const bPos = boulderGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const y = bPos.getY(i);
    const z = bPos.getZ(i);
    const s = 1 + Math.sin(x * 4 + z * 3) * 0.25;
    bPos.setXYZ(i, x * s, y * s * 0.72, z * s);
  }
  boulderGeo.computeVertexNormals();
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    bumpMap: moonMaps.bumpMap,
    bumpScale: 0.2,
    roughness: 0.92,
    metalness: 0.05,
  });
  geos.push(boulderGeo);
  mats.push(boulderMat);

  const boulderCount = 65;
  const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
  boulders.castShadow = true;
  boulders.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < boulderCount; i++) {
    const angle = (i / boulderCount) * Math.PI * 2 + (i % 5) * 0.37;
    const dist = 12 + ((i * 19.7) % 52);
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    const by = lunarTerrainHeight(bx, bz);
    const sc = 0.55 + ((i * 7.3) % 1.45);
    dummy.position.set(bx, by + sc * 0.18, bz);
    dummy.rotation.set(i * 0.5, i * 1.1, i * 0.3);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    boulders.setMatrixAt(i, dummy.matrix);

    const shade = 0.72 + ((i * 0.17) % 0.32);
    col.setRGB(shade, shade, shade * 1.02);
    boulders.setColorAt(i, col);
  }
  boulders.instanceMatrix.needsUpdate = true;
  if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
  boulders.computeBoundingSphere();
  lunarTerrainGroup.add(boulders);

  lunarTerrainGroup.visible = false;

  return {
    starFieldGroup,
    earthGroup,
    earthClouds,
    distantMoon,
    distantPlanetsGroup,
    launchPadGroup,
    skyDome,
    lunarTerrainGroup,
    updateStars(dt: number, speedMultiplier: number) {
      const clampedDt = Math.min(dt, 0.05);
      earthGroup.rotation.y += clampedDt * 0.015;
      earthClouds.rotation.y += clampedDt * 0.022;

      if (speedMultiplier > 0.01) {
        const attr = streakGeo.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const vel = 55 * speedMultiplier * clampedDt;
        for (let i = 0; i < streakCount; i++) {
          let z = arr[i * 3 + 2] + vel;
          if (z > 20) z = -195 - Math.random() * 25;
          arr[i * 3 + 2] = z;
        }
        attr.needsUpdate = true;
        flightStreaks.visible = true;
      } else {
        flightStreaks.visible = false;
      }
    },
    setSkyTransition(spaceFactor: number) {
      skyMat.uniforms.uSpaceMix.value = Math.max(0, Math.min(1, spaceFactor));
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      terrainMap.dispose();
      terrainBump.dispose();
    },
  };
}
