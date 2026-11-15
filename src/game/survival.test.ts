import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTaskProgress } from './rules';
import {
  canAffordCost,
  computeCompletedTasks,
  craftBlueprint,
  createInitialInventory,
  getEffectiveGravityMps2,
  HYPOXIA_GRACE_SEC,
  LANDING_PAD_CENTER,
  MOON_GRAVITY_G,
  MOON_GRAVITY_MPS2,
  PLANET_CATALOG,
  resolveCircleCollision,
  spendCost,
  stepCharacterJump,
  stepHypoxiaTimer,
  stepOxygenLevel,
  SURVIVAL_CRAFT_COSTS,
  survivalTerrainHeight,
  survivalTerrainNormal,
} from './survival';

test('survivalTerrainHeight is deterministic and flat across the landing pad', () => {
  const hCenter = survivalTerrainHeight(LANDING_PAD_CENTER.x, LANDING_PAD_CENTER.z);
  const hEdge1 = survivalTerrainHeight(LANDING_PAD_CENTER.x + 3.5, LANDING_PAD_CENTER.z);
  const hEdge2 = survivalTerrainHeight(LANDING_PAD_CENTER.x, LANDING_PAD_CENTER.z - 3.5);
  assert.equal(hCenter, hEdge1);
  assert.equal(hCenter, hEdge2);
  assert.ok(Math.abs(hCenter) < 2.5);
});

test('survivalTerrainNormal points upward with unit length', () => {
  const nPad = survivalTerrainNormal(LANDING_PAD_CENTER.x, LANDING_PAD_CENTER.z);
  assert.ok(Math.abs(nPad.y - 1) < 1e-6);
  const nSlope = survivalTerrainNormal(22, 18);
  const len = Math.hypot(nSlope.x, nSlope.y, nSlope.z);
  assert.ok(Math.abs(len - 1) < 1e-5);
  assert.ok(nSlope.y > 0.85);
});

test('resolveCircleCollision pushes actors smoothly out of obstacles and respects bounds', () => {
  const res = resolveCircleCollision(10.5, 10, 0.6, [{ x: 10, z: 10, radius: 1.5 }], 48);
  assert.equal(res.collided, true);
  const dist = Math.hypot(res.x - 10, res.z - 10);
  assert.ok(dist >= 2.09);

  const clamped = resolveCircleCollision(100, -100, 1, [], 48);
  assert.equal(clamped.x, 48);
  assert.equal(clamped.z, -48);
});

test('every planet spawns enough deposits to craft equipment without soft-locking', () => {
  const beaconCost = SURVIVAL_CRAFT_COSTS.beacon;
  for (const planet of PLANET_CATALOG) {
    const counts = { ice: 0, iron: 0, silicon: 0 };
    for (const [type] of planet.nodes) {
      counts[type] += 1;
    }
    assert.ok(counts.ice >= (beaconCost.ice ?? 0) + 1, `${planet.id} needs buffer ice`);
    assert.ok(counts.iron >= (beaconCost.iron ?? 0), `${planet.id} needs iron`);
    assert.ok(counts.silicon >= (beaconCost.silicon ?? 0) + 1, `${planet.id} needs buffer silicon`);
  }
});

test('craftBlueprint enforces resource costs and adds crafted kits', () => {
  const inv = createInitialInventory();
  const failRes = craftBlueprint(inv, 'oxygen');
  assert.equal(failRes.ok, false);
  assert.equal(failRes.inventory.oxygenKits, 0);

  inv.ice = 2;
  const okRes = craftBlueprint(inv, 'oxygen');
  assert.equal(okRes.ok, true);
  assert.equal(okRes.inventory.ice, 1);
  assert.equal(okRes.inventory.oxygenKits, 1);
});

test('canAffordCost and spendCost deduct multi-resource costs accurately', () => {
  const inv = { ...createInitialInventory(), ice: 3, iron: 4, silicon: 2 };
  const cost = { ice: 2, iron: 3, silicon: 2 };
  assert.equal(canAffordCost(inv, cost), true);
  const after = spendCost(inv, cost);
  assert.equal(after.ice, 1);
  assert.equal(after.iron, 1);
  assert.equal(after.silicon, 0);
  assert.equal(canAffordCost(after, cost), false);
});

test('computeCompletedTasks and computeTaskProgress stay satisfied when beacon is crafted', () => {
  const inv = { ...createInitialInventory(), ice: 3, iron: 4, silicon: 1 };
  assert.equal(computeCompletedTasks(inv, false), 2);
  inv.silicon = 2;
  assert.equal(computeCompletedTasks(inv, false), 3);
  assert.equal(computeCompletedTasks(inv, true), 4);

  // Crafting the beacon consumes ice/iron/silicon -> tasks remain checked
  const crafted = craftBlueprint(inv, 'beacon');
  assert.equal(crafted.ok, true);
  const progress = computeTaskProgress(crafted.inventory, false);
  assert.equal(progress.iceDone, true);
  assert.equal(progress.ironDone, true);
  assert.equal(progress.siliconDone, true);
  assert.equal(progress.beaconDone, false);
  assert.equal(progress.completedCount, 3);
});

test('stepOxygenLevel and stepHypoxiaTimer handle depletion, emergency countdown, and recovery', () => {
  const drained = stepOxygenLevel(80, 10, {
    nearBunker: false,
    nearPad: false,
    driving: false,
    weatherO2Mult: 1,
    suitO2Mult: 1,
  });
  assert.ok(drained < 80);

  const recharged = stepOxygenLevel(60, 2, {
    nearBunker: true,
    nearPad: false,
    driving: false,
    weatherO2Mult: 1.5,
    suitO2Mult: 1,
  });
  assert.ok(recharged > 60);

  const tick1 = stepHypoxiaTimer(HYPOXIA_GRACE_SEC, 0, 4);
  assert.equal(tick1.expired, false);
  assert.equal(tick1.timer, HYPOXIA_GRACE_SEC - 4);

  const recovered = stepHypoxiaTimer(tick1.timer, 25, 0.5);
  assert.equal(recovered.expired, false);
  assert.equal(recovered.timer, HYPOXIA_GRACE_SEC);

  const fatal = stepHypoxiaTimer(1.2, 0, 2);
  assert.equal(fatal.expired, true);
  assert.equal(fatal.timer, 0);
});

test('getEffectiveGravityMps2 and stepCharacterJump simulate Moon gravity higher and longer than 0.92g', () => {
  const moonSpec = PLANET_CATALOG.find((p) => p.id === 'moon');
  assert.ok(moonSpec, 'Luna (The Moon) should exist in PLANET_CATALOG');
  assert.equal(moonSpec.gravityG, MOON_GRAVITY_G);

  const moonG = getEffectiveGravityMps2(0.92, true);
  const keplerG = getEffectiveGravityMps2(0.92, false);
  assert.equal(moonG, MOON_GRAVITY_MPS2);
  assert.ok(keplerG > moonG * 5);

  const simulateJump = (gravityMps2: number) => {
    let state = { offsetY: 0, vy: 0, grounded: true };
    let peakY = 0;
    let airTime = 0;
    let jumped = false;
    let landed = false;

    for (let i = 0; i < 200; i++) {
      const res = stepCharacterJump(state, gravityMps2, 0.05, i === 0);
      state = res.state;
      if (res.jumped) jumped = true;
      if (!state.grounded) airTime += 0.05;
      if (state.offsetY > peakY) peakY = state.offsetY;
      if (res.landed) {
        landed = true;
        break;
      }
    }
    return { jumped, landed, peakY, airTime, finalState: state };
  };

  const moonJump = simulateJump(moonG);
  const keplerJump = simulateJump(keplerG);

  assert.equal(moonJump.jumped, true);
  assert.equal(moonJump.landed, true);
  assert.equal(moonJump.finalState.grounded, true);
  assert.equal(moonJump.finalState.offsetY, 0);
  assert.ok(moonJump.peakY > 2.5, `Moon jump peak should exceed 2.5m, got ${moonJump.peakY}`);
  assert.ok(moonJump.peakY > keplerJump.peakY * 4, 'Moon jump should be >4x higher than 0.92g');
  assert.ok(moonJump.airTime > keplerJump.airTime * 4, 'Moon jump should hang >4x longer than 0.92g');
});
