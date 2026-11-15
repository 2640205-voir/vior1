import test from 'node:test';
import assert from 'node:assert/strict';
import { SHUTTLE_MATERIALS } from './materials';
import {
  applyShieldHit,
  checkSphereCollision,
  createInitialFlightState,
  createInitialLaunchState,
  lunarTerrainHeight,
  MAX_SHIELD_HITS,
  MISSION2_DURATION_SEC,
  stepLaunchPhysics,
  stepShuttleFlight,
} from './physics';

test('Aluminium and Titanium succeed in Mission 1 launch physics', () => {
  for (const id of ['ALUMINIUM', 'TITANIUM'] as const) {
    const mat = SHUTTLE_MATERIALS[id];
    let state = createInitialLaunchState(mat);
    for (let i = 0; i < 320; i++) {
      state = stepLaunchPhysics(state, mat, 0.05);
      if (state.completed) break;
    }
    assert.equal(state.failed, false, `${id} should not fail launch`);
    assert.equal(state.completed, true, `${id} should complete Mission 1`);
    assert.ok(state.altitudeM > 3000, `${id} should reach outer space altitude`);
  }
});

test('Silver launches with reduced performance and higher fuel consumption than Aluminium', () => {
  const silver = SHUTTLE_MATERIALS.SILVER;
  const aluminium = SHUTTLE_MATERIALS.ALUMINIUM;

  let silverState = createInitialLaunchState(silver);
  let alumState = createInitialLaunchState(aluminium);

  for (let i = 0; i < 160; i++) {
    silverState = stepLaunchPhysics(silverState, silver, 0.05);
    alumState = stepLaunchPhysics(alumState, aluminium, 0.05);
  }

  assert.equal(silverState.failed, false);
  assert.ok(silverState.fuelPercent < alumState.fuelPercent, 'Silver should burn more fuel');
  assert.ok(silverState.altitudeM < alumState.altitudeM, 'Silver should climb slower');
});

test('Gold and Iron fail Mission 1 launch due to excessive mass', () => {
  for (const id of ['GOLD', 'IRON'] as const) {
    const mat = SHUTTLE_MATERIALS[id];
    let state = createInitialLaunchState(mat);
    for (let i = 0; i < 120; i++) {
      state = stepLaunchPhysics(state, mat, 0.05);
      if (state.failed) break;
    }
    assert.equal(state.failed, true, `${id} must fail launch`);
    assert.equal(state.completed, false, `${id} must not complete launch`);
    assert.equal(state.phase, 'failed');
    assert.ok(state.vibration > 0.5, `${id} should exhibit engine vibration before failure`);
  }
});

test('Mission 2 flight controls, boost drain/recharge, and 60s completion work accurately', () => {
  const mat = SHUTTLE_MATERIALS.TITANIUM;
  let flight = createInitialFlightState();

  // Hold right + up + boost
  for (let i = 0; i < 20; i++) {
    flight = stepShuttleFlight(
      flight,
      { left: false, right: true, up: true, down: false, boost: true },
      mat,
      0.05
    );
  }
  assert.ok(flight.x > 0, 'Shuttle should move right');
  assert.ok(flight.y > 0, 'Shuttle should move up');
  assert.ok(flight.boostEnergy < 100, 'Boost energy should drain when boosting');
  assert.equal(flight.isBoosting, true);

  // Release boost and check recharge
  const boostAfterDrain = flight.boostEnergy;
  for (let i = 0; i < 20; i++) {
    flight = stepShuttleFlight(
      flight,
      { left: false, right: false, up: false, down: false, boost: false },
      mat,
      0.05
    );
  }
  assert.ok(flight.boostEnergy > boostAfterDrain, 'Boost energy should recharge');

  // Simulate remaining flight until 60s completion
  for (let i = 0; i < 1300; i++) {
    flight = stepShuttleFlight(
      flight,
      { left: false, right: false, up: false, down: false, boost: false },
      mat,
      0.05
    );
    if (flight.completed) break;
  }
  assert.equal(flight.completed, true);
  assert.equal(flight.elapsedSec, MISSION2_DURATION_SEC);
});

test('Collision detection and 3-hit shield failure work properly', () => {
  assert.equal(checkSphereCollision(0, 0, 0, 1.5, 2, 0, 0, 1.0), true);
  assert.equal(checkSphereCollision(0, 0, 0, 1.5, 5, 0, 0, 1.0), false);

  const mat = SHUTTLE_MATERIALS.ALUMINIUM;
  let flight = createInitialFlightState();
  assert.equal(flight.shieldHitsRemaining, MAX_SHIELD_HITS);

  // Hit 1
  flight = applyShieldHit(flight);
  assert.equal(flight.shieldHitsRemaining, 2);
  assert.equal(flight.failed, false);

  // Invulnerability window prevents double hit on immediate next frame
  flight = applyShieldHit(flight);
  assert.equal(flight.shieldHitsRemaining, 2);

  // Wait out invulnerability
  for (let i = 0; i < 30; i++) {
    flight = stepShuttleFlight(
      flight,
      { left: false, right: false, up: false, down: false, boost: false },
      mat,
      0.05
    );
  }

  // Hit 2
  flight = applyShieldHit(flight);
  assert.equal(flight.shieldHitsRemaining, 1);
  assert.equal(flight.failed, false);

  for (let i = 0; i < 30; i++) {
    flight = stepShuttleFlight(
      flight,
      { left: false, right: false, up: false, down: false, boost: false },
      mat,
      0.05
    );
  }

  // Hit 3 -> Failure
  flight = applyShieldHit(flight);
  assert.equal(flight.shieldHitsRemaining, 0);
  assert.equal(flight.failed, true);
});

test('Lunar landing pad center is flat at y=0 for flush touchdown', () => {
  assert.equal(lunarTerrainHeight(0, 0), 0);
  assert.equal(lunarTerrainHeight(3, 3), 0);
});
