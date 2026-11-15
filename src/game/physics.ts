import type {
  FlightInputState,
  LaunchPhase,
  ShuttleMaterialSpec,
} from '../types/game';

export const MISSION2_DURATION_SEC = 60;
export const MOON_INITIAL_DISTANCE_KM = 384_400;
export const MAX_SHIELD_HITS = 3;
export const FLIGHT_BOUNDS_X = 11.5;
export const FLIGHT_BOUNDS_Y = 6.8;

const GRAVITY_EARTH = 9.81; // m/s^2
const BASE_ENGINE_THRUST_N = 28_500_000; // 28.5 MN combined RS-25 + SRBs

export interface LaunchPhysicsState {
  elapsedSec: number;
  altitudeM: number;
  velocityMs: number;
  fuelPercent: number;
  phase: LaunchPhase;
  thrustN: number;
  weightN: number;
  vibration: number;
  failed: boolean;
  completed: boolean;
}

export function createInitialLaunchState(material: ShuttleMaterialSpec): LaunchPhysicsState {
  const weightN = material.massKg * GRAVITY_EARTH;
  return {
    elapsedSec: 0,
    altitudeM: 0,
    velocityMs: 0,
    fuelPercent: 100,
    phase: 'ignition',
    thrustN: 0,
    weightN,
    vibration: 0,
    failed: false,
    completed: false,
  };
}

/**
 * Advances Mission 1 launch physics using mass, thrust, gravity, fuel consumption,
 * and atmospheric drag. Heavy/dense materials (Gold & Iron) cannot overcome weight
 * and trigger launch failure after engine strain.
 */
export function stepLaunchPhysics(
  state: LaunchPhysicsState,
  material: ShuttleMaterialSpec,
  dt: number
): LaunchPhysicsState {
  if (state.failed || state.completed) return state;

  const clampedDt = Math.min(Math.max(dt, 0), 0.05);
  const elapsedSec = state.elapsedSec + clampedDt;

  // Ignition spool-up during first 2.2 seconds
  const spoolFactor = Math.min(1, elapsedSec / 2.2);
  const maxThrust = BASE_ENGINE_THRUST_N * material.thrustMultiplier;
  const thrustN = maxThrust * (0.25 + 0.75 * spoolFactor);

  // Fuel decreases over time proportional to thrust and material burn multiplier
  const fuelBurnRate = 3.1 * material.fuelBurnMultiplier * (0.3 + 0.7 * spoolFactor);
  const fuelPercent = Math.max(0, state.fuelPercent - fuelBurnRate * clampedDt);

  // Dynamic mass decreases slightly as propellant burns (up to 18% lighter at empty)
  const propellantFraction = fuelPercent / 100;
  const currentMassKg = material.massKg * (0.82 + 0.18 * propellantFraction);
  const gravityAtAlt = GRAVITY_EARTH * Math.max(0.75, 1 - state.altitudeM / 450_000);
  const weightN = currentMassKg * gravityAtAlt;

  // Atmospheric density falls exponentially with altitude
  const airDensity = Math.exp(-state.altitudeM / 18_000);
  const dragN = 0.5 * airDensity * state.velocityMs * state.velocityMs * 115;

  const netForceN = thrustN - weightN - dragN;

  let velocityMs = state.velocityMs;
  let altitudeM = state.altitudeM;
  let phase: LaunchPhase = state.phase;
  let vibration = 0;
  let failed = false;
  let completed = false;

  if (!material.canLaunch) {
    // Heavy materials (Gold / Iron): thrust never exceeds weight; shuttle shudders on pad and fails
    vibration = Math.min(1, spoolFactor * 0.95);
    altitudeM = Math.max(0, Math.sin(elapsedSec * 28) * 0.04 * spoolFactor);
    velocityMs = 0;
    phase = elapsedSec > 4.4 ? 'failed' : 'ignition';
    if (elapsedSec > 4.4) {
      failed = true;
    }
  } else {
    if (elapsedSec < 2.2) {
      // Phase 1: Ignition clamps hold shuttle while engines build full thrust
      phase = 'ignition';
      vibration = 0.25 + 0.35 * spoolFactor;
      velocityMs = 0;
      altitudeM = 0;
    } else {
      // Clamp acceleration to keep cinematic pacing smooth across Aluminium, Titanium, and Silver
      const rawAccel = Math.max(0, netForceN / currentMassKg);
      // Silver lifts noticeably heavier/slower than Aluminium & Titanium
      const cinematicAccel = rawAccel * (material.id === 'SILVER' ? 2.4 : 3.2);
      velocityMs = Math.min(2600, velocityMs + cinematicAccel * clampedDt * 8.5);
      altitudeM += velocityMs * clampedDt;

      if (altitudeM < 180) {
        phase = 'liftoff';
        vibration = 0.45;
      } else if (altitudeM < 3200) {
        phase = 'acceleration';
        vibration = 0.28;
      } else if (elapsedSec < 12.2) {
        phase = 'atmosphere_exit';
        vibration = 0.14;
      } else {
        phase = 'atmosphere_exit';
        completed = true;
      }
    }
  }

  return {
    elapsedSec,
    altitudeM,
    velocityMs,
    fuelPercent,
    phase,
    thrustN,
    weightN,
    vibration,
    failed,
    completed,
  };
}

export interface FlightKinematicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  roll: number;
  pitch: number;
  boostEnergy: number;
  isBoosting: boolean;
  elapsedSec: number;
  shieldHitsRemaining: number;
  invulnerableTimer: number;
  obstaclesAvoided: number;
  failed: boolean;
  completed: boolean;
}

export function createInitialFlightState(): FlightKinematicsState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    roll: 0,
    pitch: 0,
    boostEnergy: 100,
    isBoosting: false,
    elapsedSec: 0,
    shieldHitsRemaining: MAX_SHIELD_HITS,
    invulnerableTimer: 0,
    obstaclesAvoided: 0,
    failed: false,
    completed: false,
  };
}

/**
 * Pure simulation step for Mission 2 Outer Space Flight.
 */
export function stepShuttleFlight(
  state: FlightKinematicsState,
  input: FlightInputState,
  material: ShuttleMaterialSpec,
  dt: number,
  targetDurationSec: number = MISSION2_DURATION_SEC
): FlightKinematicsState {
  if (state.failed || state.completed) return state;

  const clampedDt = Math.min(Math.max(dt, 0), 0.05);

  // Boost logic
  const wantsBoost = input.boost && state.boostEnergy > 1;
  const isBoosting = wantsBoost;
  let boostEnergy = state.boostEnergy;
  if (isBoosting) {
    boostEnergy = Math.max(0, boostEnergy - 28 * clampedDt);
  } else {
    boostEnergy = Math.min(100, boostEnergy + 14 * clampedDt);
  }

  // Forward flight progress (boost accelerates mission progress slightly)
  const timeFactor = isBoosting ? 1.38 : 1.0;
  const elapsedSec = Math.min(targetDurationSec, state.elapsedSec + clampedDt * timeFactor);
  const completed = elapsedSec >= targetDurationSec;

  // Lateral & vertical acceleration
  const axisX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const axisY = (input.up ? 1 : 0) - (input.down ? 1 : 0);

  const accel = 46 * material.agilityMultiplier * (isBoosting ? 1.22 : 1.0);
  const damping = 5.4;

  let vx = state.vx + axisX * accel * clampedDt;
  let vy = state.vy + axisY * accel * clampedDt;

  // Exponential velocity damping for smooth deceleration
  const dampFactor = Math.exp(-damping * clampedDt);
  if (axisX === 0) vx *= dampFactor;
  if (axisY === 0) vy *= dampFactor;

  const maxSpeed = 14.5 * material.agilityMultiplier * (isBoosting ? 1.2 : 1.0);
  vx = Math.max(-maxSpeed, Math.min(maxSpeed, vx));
  vy = Math.max(-maxSpeed, Math.min(maxSpeed, vy));

  let x = state.x + vx * clampedDt;
  let y = state.y + vy * clampedDt;

  if (x < -FLIGHT_BOUNDS_X) {
    x = -FLIGHT_BOUNDS_X;
    vx = Math.max(0, vx);
  } else if (x > FLIGHT_BOUNDS_X) {
    x = FLIGHT_BOUNDS_X;
    vx = Math.min(0, vx);
  }

  if (y < -FLIGHT_BOUNDS_Y) {
    y = -FLIGHT_BOUNDS_Y;
    vy = Math.max(0, vy);
  } else if (y > FLIGHT_BOUNDS_Y) {
    y = FLIGHT_BOUNDS_Y;
    vy = Math.min(0, vy);
  }

  // Target bank/roll and pitch aligned with movement direction (nose stays pointed -Z)
  const targetRoll = -vx * 0.042;
  const targetPitch = vy * 0.032;
  const rotLerp = 1 - Math.exp(-9 * clampedDt);
  const roll = state.roll + (targetRoll - state.roll) * rotLerp;
  const pitch = state.pitch + (targetPitch - state.pitch) * rotLerp;

  const invulnerableTimer = Math.max(0, state.invulnerableTimer - clampedDt);

  return {
    ...state,
    x,
    y,
    vx,
    vy,
    roll,
    pitch,
    boostEnergy,
    isBoosting,
    elapsedSec,
    invulnerableTimer,
    completed,
  };
}

export function checkSphereCollision(
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  const rSum = ar + br;
  return dx * dx + dy * dy + dz * dz <= rSum * rSum;
}

export function applyShieldHit(state: FlightKinematicsState): FlightKinematicsState {
  if (state.invulnerableTimer > 0 || state.failed || state.completed) {
    return state;
  }
  const nextHits = Math.max(0, state.shieldHitsRemaining - 1);
  return {
    ...state,
    shieldHitsRemaining: nextHits,
    invulnerableTimer: 1.15,
    failed: nextHits <= 0,
  };
}

/**
 * Deterministic lunar terrain height function shared between terrain geometry,
 * shuttle touchdown target, boulders, and walking astronauts.
 */
export function lunarTerrainHeight(x: number, z: number): number {
  const distFromCenter = Math.sqrt(x * x + z * z);
  // Keep landing pad center (radius < 10m) gently flat so shuttle sits squarely
  const padFlatten = Math.min(1, Math.max(0, (distFromCenter - 7) / 14));

  const rollingHills =
    Math.sin(x * 0.06) * Math.cos(z * 0.05) * 2.2 +
    Math.sin(x * 0.14 + 1.1) * Math.sin(z * 0.12 - 0.5) * 0.75;

  // Rim mountains far out
  const rimRise = Math.max(0, (distFromCenter - 45) * 0.18);

  // Subtle craters
  const c1 = craterProfile(x - 24, z + 18, 9.5, 1.4);
  const c2 = craterProfile(x + 28, z + 26, 12.0, 1.8);
  const c3 = craterProfile(x - 19, z - 25, 7.5, 1.1);
  const c4 = craterProfile(x + 20, z - 20, 6.0, 0.9);

  return (rollingHills + c1 + c2 + c3 + c4) * padFlatten + rimRise;
}

function craterProfile(dx: number, dz: number, radius: number, depth: number): number {
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > radius * 1.35) return 0;
  const t = d / radius;
  if (t < 1.0) {
    return -depth * (1 - t * t);
  }
  // Raised crater rim
  const rimT = (t - 1.0) / 0.35;
  return depth * 0.28 * Math.sin(rimT * Math.PI);
}
