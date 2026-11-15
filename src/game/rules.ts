import { NEEDED_RESOURCES, type Inventory } from './types';

export interface TaskProgress {
  iceDone: boolean;
  ironDone: boolean;
  siliconDone: boolean;
  beaconDone: boolean;
  completedCount: number;
}

export function computeTaskProgress(inv: Inventory, complete: boolean): TaskProgress {
  const beaconCraftedOrDeployed = complete || inv.beaconKits > 0;
  const iceDone = beaconCraftedOrDeployed || inv.ice >= NEEDED_RESOURCES.ice;
  const ironDone = beaconCraftedOrDeployed || inv.iron >= NEEDED_RESOURCES.iron;
  const siliconDone = beaconCraftedOrDeployed || inv.silicon >= NEEDED_RESOURCES.silicon;
  const beaconDone = complete;
  const completedCount =
    (iceDone ? 1 : 0) +
    (ironDone ? 1 : 0) +
    (siliconDone ? 1 : 0) +
    (beaconDone ? 1 : 0);

  return {
    iceDone,
    ironDone,
    siliconDone,
    beaconDone,
    completedCount,
  };
}
