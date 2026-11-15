export type MaterialId = 'ALUMINIUM' | 'SILVER' | 'GOLD' | 'TITANIUM' | 'IRON';

export type GameScreen =
  | 'loading'
  | 'menu'
  | 'customization'
  | 'mission1'
  | 'mission2'
  | 'mission3'
  | 'complete'
  | 'survival';

export type ModalType = 'none' | 'help' | 'settings' | 'missions' | 'pause';

export type GraphicsQuality = 'high' | 'medium' | 'low';

export type LaunchPhase =
  | 'ignition'
  | 'liftoff'
  | 'acceleration'
  | 'atmosphere_exit'
  | 'failed';

export type LandingPhase =
  | 'approach'
  | 'descent'
  | 'touchdown'
  | 'hatch_open'
  | 'astronaut_walk'
  | 'flag_plant'
  | 'settled';

export interface ShuttleMaterialSpec {
  id: MaterialId;
  name: string;
  densityLabel: string;
  densityValue: number;
  weightClass: 'Lightweight' | 'Medium' | 'Very heavy';
  heatResistance: 'Low' | 'Medium' | 'Good' | 'High' | 'Very high';
  launchSuitability: 'Poor' | 'Moderate' | 'Good' | 'Excellent';
  canLaunch: boolean;
  /** Effective structural mass multiplier for launch physics */
  massKg: number;
  /** Fuel burn rate multiplier (higher = burns faster) */
  fuelBurnMultiplier: number;
  /** Thrust efficiency factor in Mission 1 & 2 */
  thrustMultiplier: number;
  /** Max lateral maneuver agility in Mission 2 */
  agilityMultiplier: number;
  /** PBR visual properties */
  colorHex: number;
  swatchCss: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  anisotropy: number;
  envMapIntensity: number;
}

export interface GameSettings {
  volume: number;
  muted: boolean;
  quality: GraphicsQuality;
}

export interface GameProgress {
  highestMissionUnlocked: 1 | 2 | 3;
  missionsCompleted: number;
  bestFlightTime: number | null;
  lastMaterial: MaterialId;
  part2CompletedCount: number;
}

export interface Mission1Telemetry {
  phase: LaunchPhase;
  altitudeKm: number;
  velocityMs: number;
  fuelPercent: number;
  thrustKn: number;
  weightKn: number;
  vibration: number;
  failed: boolean;
}

export interface Mission2Telemetry {
  distanceKm: number;
  speedKms: number;
  shieldHitsRemaining: number;
  maxShieldHits: number;
  boostPercent: number;
  isBoosting: boolean;
  elapsedSec: number;
  targetDurationSec: number;
  progressPercent: number;
  obstaclesAvoided: number;
  failed: boolean;
  damageFlashNonce: number;
}

export interface Mission3Telemetry {
  phase: LandingPhase;
  altitudeM: number;
  verticalSpeedMs: number;
  gearDeployed: boolean;
}

export interface FlightInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
}

export interface CompletedMissionStats {
  material: MaterialId;
  flightDurationSec: number;
  obstaclesAvoided: number;
  shieldHitsTaken: number;
}

export type SurvivalPhase = 'intro' | 'orbit' | 'descent' | 'surface' | 'complete' | 'failed';

export type SurvivalResourceType = 'ice' | 'iron' | 'silicon';

export type SurvivalCraftKind = 'oxygen' | 'repair' | 'bunker' | 'beacon';

export type SurvivalPlanetId = 'kepler' | 'moon' | 'ares' | 'glacies';
export type SurvivalSuitId = 'mk1' | 'mk2' | 'mk3';
export type SurvivalRoverId = 'pathfinder' | 'goliath' | 'strider';

export interface SurvivalResourceCost {
  ice?: number;
  iron?: number;
  silicon?: number;
}

export interface SurvivalInventory {
  ice: number;
  iron: number;
  silicon: number;
  energy: number;
  oxygenKits: number;
  repairKits: number;
  bunkerKits: number;
  beaconKits: number;
}

export interface SurvivalTelemetry {
  phase: SurvivalPhase;
  planetId: SurvivalPlanetId;
  planetName: string;
  planetGravityG: number;
  moonGravity: boolean;
  effectiveGravityMps2: number;
  isAirborne: boolean;
  shuttleMaterial: MaterialId;
  suitId: SurvivalSuitId;
  suitName: string;
  roverId: SurvivalRoverId;
  roverName: string;
  weatherName: string;
  weatherIndex: number;
  weatherVisibility: number;
  roverImpact: string;
  oxygen: number;
  hypoxiaTimer: number;
  roverBattery: number;
  roverSpeedKmh: number;
  driving: boolean;
  nearRover: boolean;
  roverStatusText: string;
  scannerText: string;
  scannerTimer: number;
  bunkerCount: number;
  autoOrbit: boolean;
  promptText: string;
  mineProgress: number;
  inventory: SurvivalInventory;
  unlockedPlanets: SurvivalPlanetId[];
  unlockedSuits: SurvivalSuitId[];
  unlockedRovers: SurvivalRoverId[];
  completedTasks: number;
}
