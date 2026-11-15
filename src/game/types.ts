import type {
  SurvivalInventory,
  SurvivalPlanetId,
  SurvivalRoverId,
  SurvivalSuitId,
} from '../types/game';
import {
  PLANET_CATALOG,
  ROVER_CATALOG,
  SUIT_CATALOG,
  SURVIVAL_REQUIRED,
  WEATHER_TYPES,
} from './survival';

export { PLANET_CATALOG, ROVER_CATALOG, SUIT_CATALOG, WEATHER_TYPES };
export const NEEDED_RESOURCES = SURVIVAL_REQUIRED;

export type Inventory = SurvivalInventory;

export type GameHudPhase = 'intro' | 'orbit' | 'playing' | 'gameover';

export interface HudSnapshot {
  phase: GameHudPhase;
  subPhase: 'INTRO' | 'ORBIT' | 'DESCENT' | 'SURFACE' | 'COMPLETE' | 'FAILED';
  planetId: SurvivalPlanetId;
  planetGravityG: number;
  moonGravity: boolean;
  effectiveGravityMps2: number;
  isAirborne: boolean;
  suitId: SurvivalSuitId;
  roverId: SurvivalRoverId;
  weatherIndex: number;
  oxygen: number;
  hypoxiaTimer: number;
  roverBattery: number;
  roverSpeedKmh: number;
  driving: boolean;
  bunkerCount: number;
  complete: boolean;
  failed: boolean;
  autoOrbit: boolean;
  scannerTimer: number;
  roverStateLabel: string;
  prompt: string;
}
