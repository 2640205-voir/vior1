import type {
  SurvivalCraftKind,
  SurvivalInventory,
  SurvivalPlanetId,
  SurvivalResourceCost,
  SurvivalResourceType,
  SurvivalRoverId,
  SurvivalSuitId,
} from '../types/game';

export interface SurvivalPlanetSpec {
  id: SurvivalPlanetId;
  name: string;
  subtitle: string;
  perk: string;
  gravityG: number;
  ambientTempC: number;
  cost: SurvivalResourceCost;
  groundTint: [number, number, number];
  skyTop: number;
  skyHorizon: number;
  moonColor: number;
  hasRingMoon?: boolean;
  weatherBias: number[];
  nodes: Array<[SurvivalResourceType, number, number]>;
}

export interface SurvivalSuitSpec {
  id: SurvivalSuitId;
  name: string;
  subtitle: string;
  perk: string;
  cost: SurvivalResourceCost;
  o2Mult: number;
  speedMult: number;
  mineTime: number;
  suitColor: number;
  visorColor: number;
  packColor: number;
}

export interface SurvivalRoverSpec {
  id: SurvivalRoverId;
  name: string;
  subtitle: string;
  perk: string;
  cost: SurvivalResourceCost;
  speed: number;
  drainMult: number;
  mineReach: number;
  solarCharge: number;
  hullColor: number;
  accentColor: number;
}

export interface SurvivalWeatherSpec {
  name: string;
  visibility: number;
  speedMult: number;
  tractionMult: number;
  oxygenMult: number;
  fogFar: number;
  bgHex: number;
  sunIntensity: number;
  impact: string;
  particleColor: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

export const SURVIVAL_REQUIRED: Record<SurvivalResourceType, number> = {
  ice: 3,
  iron: 4,
  silicon: 2,
};

export const SURVIVAL_CRAFT_COSTS: Record<SurvivalCraftKind, SurvivalResourceCost> = {
  oxygen: { ice: 1 },
  repair: { iron: 2, silicon: 1 },
  bunker: { ice: 2, iron: 3, silicon: 2 },
  beacon: { ice: 3, iron: 4, silicon: 2 },
};

export const LANDING_PAD_CENTER = { x: -3, z: -5 };
export const HYPOXIA_GRACE_SEC = 10;

export const EARTH_GRAVITY_MPS2 = 9.81;
export const MOON_GRAVITY_G = 0.16;
export const MOON_GRAVITY_MPS2 = 1.62;
export const ASTRONAUT_JUMP_VELOCITY = 3.1;

export interface JumpPhysicsState {
  offsetY: number;
  vy: number;
  grounded: boolean;
}

export function getEffectiveGravityMps2(planetGravityG: number, moonGravityEnabled: boolean): number {
  if (moonGravityEnabled || Math.abs(planetGravityG - MOON_GRAVITY_G) < 0.01) {
    return MOON_GRAVITY_MPS2;
  }
  return Math.max(0.5, planetGravityG * EARTH_GRAVITY_MPS2);
}

export function stepCharacterJump(
  state: JumpPhysicsState,
  gravityMps2: number,
  dt: number,
  jumpRequested: boolean
): { state: JumpPhysicsState; jumped: boolean; landed: boolean } {
  const clampedDt = Math.min(Math.max(dt, 0), 0.1);
  let { offsetY, vy, grounded } = state;
  let jumped = false;
  let landed = false;

  if (grounded && jumpRequested) {
    vy = ASTRONAUT_JUMP_VELOCITY;
    grounded = false;
    jumped = true;
  }

  if (!grounded) {
    vy -= gravityMps2 * clampedDt;
    offsetY += vy * clampedDt;
    if (offsetY <= 0) {
      offsetY = 0;
      vy = 0;
      grounded = true;
      landed = true;
    }
  }

  return {
    state: { offsetY, vy, grounded },
    jumped,
    landed,
  };
}

export const PLANET_CATALOG: SurvivalPlanetSpec[] = [
  {
    id: 'kepler',
    name: 'KEPLER-186f',
    subtitle: 'Temperate Rocky Exoplanet · 0.92g',
    perk: 'Balanced minerals · Standard orbital weather cycle',
    gravityG: 0.92,
    ambientTempC: -12,
    cost: {},
    groundTint: [0.52, 0.49, 0.47],
    skyTop: 0x060d20,
    skyHorizon: 0x1b375e,
    moonColor: 0x8e99b2,
    weatherBias: [0, 1, 2, 3],
    nodes: [
      ['ice', -12, -10],
      ['ice', 13, -16],
      ['ice', 17, 9],
      ['ice', -24, 14],
      ['ice', 26, -19],
      ['iron', -17, 5],
      ['iron', -9, 18],
      ['iron', 10, 20],
      ['iron', 22, -3],
      ['iron', -28, -6],
      ['iron', 18, 25],
      ['silicon', 5, -25],
      ['silicon', -23, -18],
      ['silicon', 28, 13],
      ['silicon', -4, 30],
    ],
  },
  {
    id: 'moon',
    name: 'LUNA (THE MOON)',
    subtitle: 'Mare Tranquillitatis · 0.16g',
    perk: 'True Lunar Gravity (1.62 m/s²) · Long-hang low-gravity leaps',
    gravityG: MOON_GRAVITY_G,
    ambientTempC: -130,
    cost: {},
    groundTint: [0.58, 0.6, 0.64],
    skyTop: 0x02040a,
    skyHorizon: 0x0c162b,
    moonColor: 0x4b90e2,
    weatherBias: [0],
    nodes: [
      ['ice', -12, -9],
      ['ice', 13, -15],
      ['ice', 16, 10],
      ['ice', -23, 13],
      ['ice', 25, -18],
      ['iron', -16, 6],
      ['iron', -8, 18],
      ['iron', 11, 20],
      ['iron', 22, -4],
      ['iron', -27, -5],
      ['silicon', 6, -24],
      ['silicon', -22, -17],
      ['silicon', 27, 13],
      ['silicon', -4, 29],
    ],
  },
  {
    id: 'ares',
    name: 'ARES-IV CRIMSON',
    subtitle: 'Arid Iron-Oxide Canyon · 0.38g',
    perk: 'High Iron & Silicon veins · Frequent Dust Storms',
    gravityG: 0.38,
    ambientTempC: -44,
    cost: { iron: 2, silicon: 1 },
    groundTint: [0.76, 0.37, 0.27],
    skyTop: 0x180908,
    skyHorizon: 0x633223,
    moonColor: 0xc48268,
    weatherBias: [1, 1, 0, 3],
    nodes: [
      ['iron', -11, -9],
      ['iron', 14, -14],
      ['iron', 18, 8],
      ['iron', -16, 6],
      ['iron', 8, 19],
      ['iron', -27, -3],
      ['iron', 26, -15],
      ['silicon', -8, 17],
      ['silicon', 21, -4],
      ['silicon', -20, 22],
      ['silicon', 15, 28],
      ['ice', 6, -24],
      ['ice', -22, -16],
      ['ice', 29, 14],
      ['ice', -3, 29],
    ],
  },
  {
    id: 'glacies',
    name: 'GLACIES-9',
    subtitle: 'Cryogenic Ice Moon · 0.22g',
    perk: 'Abundant glacial Water Ice · Heavy Ice Storms',
    gravityG: 0.22,
    ambientTempC: -138,
    cost: { ice: 2, silicon: 1 },
    groundTint: [0.46, 0.67, 0.85],
    skyTop: 0x041224,
    skyHorizon: 0x27577d,
    moonColor: 0xa8e2ff,
    hasRingMoon: true,
    weatherBias: [2, 2, 0, 3],
    nodes: [
      ['ice', -11, -10],
      ['ice', 12, -15],
      ['ice', 16, 10],
      ['ice', -18, 4],
      ['ice', 9, 20],
      ['ice', 26, -12],
      ['ice', -27, 16],
      ['silicon', -9, 17],
      ['silicon', 20, -5],
      ['silicon', 4, -24],
      ['silicon', -23, -18],
      ['iron', -21, -17],
      ['iron', 18, 23],
      ['iron', -6, 28],
      ['iron', 28, 11],
    ],
  },
];

export const SUIT_CATALOG: SurvivalSuitSpec[] = [
  {
    id: 'mk1',
    name: 'MK-I EXPLORER',
    subtitle: 'Standard Orbital Survey Suit',
    perk: 'Baseline O2 efficiency · Standard sprint speed',
    cost: {},
    o2Mult: 1,
    speedMult: 1,
    mineTime: 1.25,
    suitColor: 0xe9f1f7,
    visorColor: 0xc79232,
    packColor: 0xd54b51,
  },
  {
    id: 'mk2',
    name: 'MK-II THERMAL TITAN',
    subtitle: 'Insulated Heavy Alloy Suit',
    perk: '-35% Oxygen drain · +15% Movement speed',
    cost: { iron: 2, ice: 1 },
    o2Mult: 0.65,
    speedMult: 1.15,
    mineTime: 1.1,
    suitColor: 0xd8b25c,
    visorColor: 0x26415c,
    packColor: 0x394a59,
  },
  {
    id: 'mk3',
    name: 'MK-III AEGIS EXO-SUIT',
    subtitle: 'Quantum-Shielded Recon Rig',
    perk: '-55% Oxygen drain · +25% Speed · +35% Faster Mining',
    cost: { silicon: 2, iron: 2, ice: 1 },
    o2Mult: 0.45,
    speedMult: 1.25,
    mineTime: 0.8,
    suitColor: 0x49c6e5,
    visorColor: 0xd7f4ff,
    packColor: 0x175676,
  },
];

export const ROVER_CATALOG: SurvivalRoverSpec[] = [
  {
    id: 'pathfinder',
    name: 'PATHFINDER 6x6',
    subtitle: 'Standard Scientific Exploration Rover',
    perk: 'Balanced drive speed & battery consumption',
    cost: {},
    speed: 9.2,
    drainMult: 1,
    mineReach: 4.0,
    solarCharge: 0,
    hullColor: 0xd1dce3,
    accentColor: 0xc49545,
  },
  {
    id: 'goliath',
    name: 'GOLIATH HEAVY HAULER',
    subtitle: 'Armored Deep-Core Mining Rig',
    perk: '50% slower battery drain · Extended 5.6m mining reach',
    cost: { iron: 3, silicon: 1 },
    speed: 8.6,
    drainMult: 0.5,
    mineReach: 5.6,
    solarCharge: 0,
    hullColor: 0x96403a,
    accentColor: 0xe3a43b,
  },
  {
    id: 'strider',
    name: 'ION-STRIDER RECON',
    subtitle: 'High-Velocity Solar Interceptor',
    perk: '+40% Top speed · Solar auto-recharge in clear weather',
    cost: { silicon: 2, iron: 2 },
    speed: 12.8,
    drainMult: 0.75,
    mineReach: 4.2,
    solarCharge: 0.45,
    hullColor: 0x2e94c9,
    accentColor: 0x6ef3ff,
  },
];

export const WEATHER_TYPES: SurvivalWeatherSpec[] = [
  {
    name: 'CLEAR',
    visibility: 100,
    speedMult: 1,
    tractionMult: 1.0,
    oxygenMult: 1,
    fogFar: 118,
    bgHex: 0x070d1e,
    sunIntensity: 3.2,
    impact: 'NORMAL',
    particleColor: 0xbfeaff,
  },
  {
    name: 'DUST STORM',
    visibility: 42,
    speedMult: 0.68,
    tractionMult: 0.65,
    oxygenMult: 1.65,
    fogFar: 28,
    bgHex: 0x573325,
    sunIntensity: 1.25,
    impact: 'LOW GRIP',
    particleColor: 0xe6a36c,
  },
  {
    name: 'ICE STORM',
    visibility: 55,
    speedMult: 0.74,
    tractionMult: 0.42,
    oxygenMult: 1.45,
    fogFar: 35,
    bgHex: 0x5d7a91,
    sunIntensity: 1.6,
    impact: 'SLIPPERY',
    particleColor: 0xb9eaff,
  },
  {
    name: 'ELECTRICAL STORM',
    visibility: 68,
    speedMult: 0.84,
    tractionMult: 0.85,
    oxygenMult: 1.25,
    fogFar: 48,
    bgHex: 0x151b3a,
    sunIntensity: 1.0,
    impact: 'POWER DRAIN',
    particleColor: 0x9c9aff,
  },
];

export const MINE_SITE_COORDS: Array<[number, number]> = [
  [-14, -14],
  [16, -18],
  [-19, 8],
  [8, 22],
];

function rawTerrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.075) * 0.62 +
    Math.cos(z * 0.068) * 0.48 +
    Math.sin((x + z) * 0.035) * 1.02
  );
}

const PAD_BASE_HEIGHT = rawTerrainHeight(LANDING_PAD_CENTER.x, LANDING_PAD_CENTER.z);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic planetary terrain height that smoothly flattens around
 * the landing pad (-3, -5) so the Space Shuttle landing gear and pad sit 100% flush.
 */
export function survivalTerrainHeight(x: number, z: number): number {
  const raw = rawTerrainHeight(x, z);
  const distPad = Math.hypot(x - LANDING_PAD_CENTER.x, z - LANDING_PAD_CENTER.z);
  const blend = smoothstep(5.4, 10.2, distPad);
  return PAD_BASE_HEIGHT + (raw - PAD_BASE_HEIGHT) * blend;
}

/**
 * Computes the unit surface normal at (x, z) via central finite differences
 * so the rover and structures tilt accurately over slopes.
 */
export function survivalTerrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const eps = 0.35;
  const hL = survivalTerrainHeight(x - eps, z);
  const hR = survivalTerrainHeight(x + eps, z);
  const hD = survivalTerrainHeight(x, z - eps);
  const hU = survivalTerrainHeight(x, z + eps);
  const nx = hL - hR;
  const ny = 2 * eps;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Resolves 2D circle-vs-circle collisions so the astronaut and rover smoothly
 * slide around boulders, the shuttle fuselage, and buildings.
 */
export function resolveCircleCollision(
  posX: number,
  posZ: number,
  actorRadius: number,
  colliders: CircleCollider[],
  boundLimit = 48
): { x: number; z: number; collided: boolean } {
  let x = Math.max(-boundLimit, Math.min(boundLimit, posX));
  let z = Math.max(-boundLimit, Math.min(boundLimit, posZ));
  let collided = false;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const minDist = actorRadius + c.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        collided = true;
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = minDist - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        } else {
          x += minDist;
        }
      }
    }
  }

  x = Math.max(-boundLimit, Math.min(boundLimit, x));
  z = Math.max(-boundLimit, Math.min(boundLimit, z));
  return { x, z, collided };
}

export function createInitialInventory(): SurvivalInventory {
  return {
    ice: 0,
    iron: 0,
    silicon: 0,
    energy: 2,
    oxygenKits: 0,
    repairKits: 0,
    bunkerKits: 0,
    beaconKits: 0,
  };
}

export function canAffordCost(inv: SurvivalInventory, cost: SurvivalResourceCost): boolean {
  if ((cost.ice ?? 0) > inv.ice) return false;
  if ((cost.iron ?? 0) > inv.iron) return false;
  if ((cost.silicon ?? 0) > inv.silicon) return false;
  return true;
}

export function spendCost(inv: SurvivalInventory, cost: SurvivalResourceCost): SurvivalInventory {
  return {
    ...inv,
    ice: inv.ice - (cost.ice ?? 0),
    iron: inv.iron - (cost.iron ?? 0),
    silicon: inv.silicon - (cost.silicon ?? 0),
  };
}

export function craftBlueprint(
  inv: SurvivalInventory,
  kind: SurvivalCraftKind
): { ok: boolean; inventory: SurvivalInventory; message: string } {
  const cost = SURVIVAL_CRAFT_COSTS[kind];
  if (!canAffordCost(inv, cost)) {
    return { ok: false, inventory: inv, message: 'Insufficient materials for this blueprint.' };
  }
  const next = spendCost(inv, cost);
  if (kind === 'oxygen') next.oxygenKits += 1;
  else if (kind === 'repair') next.repairKits += 1;
  else if (kind === 'bunker') next.bunkerKits += 1;
  else next.beaconKits += 1;

  const labels: Record<SurvivalCraftKind, string> = {
    oxygen: 'Oxygen canister',
    repair: 'Rover repair kit',
    bunker: 'Habitation Bunker Kit',
    beacon: 'Research Beacon Kit',
  };
  return {
    ok: true,
    inventory: next,
    message: `${labels[kind]} successfully fabricated!`,
  };
}

export function formatResourceCost(cost: SurvivalResourceCost): string {
  const parts: string[] = [];
  if (cost.ice) parts.push(`${cost.ice} Water Ice`);
  if (cost.iron) parts.push(`${cost.iron} Iron Ore`);
  if (cost.silicon) parts.push(`${cost.silicon} Silicon`);
  return parts.length ? parts.join(' + ') : 'FREE (STANDARD ISSUE)';
}

export function computeCompletedTasks(inv: SurvivalInventory, beaconDeployed: boolean): number {
  const sat = beaconDeployed || inv.beaconKits > 0;
  let done = 0;
  if (sat || inv.ice >= SURVIVAL_REQUIRED.ice) done += 1;
  if (sat || inv.iron >= SURVIVAL_REQUIRED.iron) done += 1;
  if (sat || inv.silicon >= SURVIVAL_REQUIRED.silicon) done += 1;
  if (beaconDeployed) done += 1;
  return done;
}

export function stepOxygenLevel(
  currentOxygen: number,
  dt: number,
  params: { nearBunker: boolean; nearPad: boolean; driving: boolean; weatherO2Mult: number; suitO2Mult: number }
): number {
  if (params.nearBunker) {
    return Math.min(100, currentOxygen + dt * 5.2);
  }
  let next = Math.max(
    0,
    currentOxygen - dt * 0.24 * params.weatherO2Mult * params.suitO2Mult * (params.driving ? 0.35 : 1)
  );
  if (params.nearPad && next < 99.5) {
    next = Math.min(100, next + dt * 3.4);
  }
  return next;
}

/**
 * Tracks emergency hypoxia reserve once suit oxygen hits 0%.
 * Restores cleanly back to full reserve once oxygen rises above 0%.
 */
export function stepHypoxiaTimer(
  currentTimer: number,
  oxygen: number,
  dt: number
): { timer: number; expired: boolean } {
  if (oxygen > 0.05) {
    return { timer: HYPOXIA_GRACE_SEC, expired: false };
  }
  const next = Math.max(0, currentTimer - dt);
  return { timer: next, expired: next <= 0 };
}
