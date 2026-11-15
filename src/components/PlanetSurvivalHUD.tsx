import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceAudioEngine } from '../game/audio';
import {
  canAffordCost,
  formatResourceCost,
  HYPOXIA_GRACE_SEC,
  MOON_GRAVITY_G,
  MOON_GRAVITY_MPS2,
  PLANET_CATALOG,
  ROVER_CATALOG,
  SUIT_CATALOG,
  SURVIVAL_REQUIRED,
} from '../game/survival';
import type { HudSnapshot } from '../game/types';
import { PlanetSurvivalEngine } from '../three/PlanetSurvivalEngine';
import type {
  GraphicsQuality,
  MaterialId,
  SurvivalCraftKind,
  SurvivalPlanetId,
  SurvivalRoverId,
  SurvivalSuitId,
  SurvivalTelemetry,
} from '../types/game';
import { GameHud } from './GameHud';

interface PlanetSurvivalHUDProps {
  audio: SpaceAudioEngine;
  quality: GraphicsQuality;
  shuttleMaterial: MaterialId;
  muted: boolean;
  paused: boolean;
  startSurface?: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestartPart2: () => void;
  onReplayPart1: () => void;
  onMainMenu: () => void;
  onCompletePart2: () => void;
}

function makeInitialTelemetry(shuttleMaterial: MaterialId, startSurface: boolean): SurvivalTelemetry {
  return {
    phase: startSurface ? 'surface' : 'intro',
    planetId: 'kepler',
    planetName: 'KEPLER-186f',
    planetGravityG: MOON_GRAVITY_G,
    moonGravity: true,
    effectiveGravityMps2: MOON_GRAVITY_MPS2,
    isAirborne: false,
    shuttleMaterial,
    suitId: 'mk1',
    suitName: 'MK-I EXPLORER',
    roverId: 'pathfinder',
    roverName: 'PATHFINDER 6x6',
    weatherName: 'CLEAR',
    weatherIndex: 0,
    weatherVisibility: 100,
    roverImpact: 'NORMAL',
    oxygen: 100,
    hypoxiaTimer: HYPOXIA_GRACE_SEC,
    roverBattery: 100,
    roverSpeedKmh: 0,
    driving: false,
    nearRover: false,
    roverStatusText: 'READY · PRESS R',
    scannerText: 'READY',
    scannerTimer: 0,
    bunkerCount: 0,
    autoOrbit: false,
    promptText: 'Land your spacecraft to begin the expedition.',
    mineProgress: 0,
    inventory: {
      ice: 0,
      iron: 0,
      silicon: 0,
      energy: 2,
      oxygenKits: 0,
      repairKits: 0,
      bunkerKits: 0,
      beaconKits: 0,
    },
    unlockedPlanets: ['kepler', 'moon'],
    unlockedSuits: ['mk1'],
    unlockedRovers: ['pathfinder'],
    completedTasks: 0,
  };
}

function toHudSnapshot(t: SurvivalTelemetry): HudSnapshot {
  const phase: HudSnapshot['phase'] =
    t.phase === 'intro'
      ? 'intro'
      : t.phase === 'orbit' || t.phase === 'descent'
      ? 'orbit'
      : t.phase === 'complete' || t.phase === 'failed'
      ? 'gameover'
      : 'playing';

  const subPhase: HudSnapshot['subPhase'] =
    t.phase === 'intro'
      ? 'INTRO'
      : t.phase === 'orbit'
      ? 'ORBIT'
      : t.phase === 'descent'
      ? 'DESCENT'
      : t.phase === 'complete'
      ? 'COMPLETE'
      : t.phase === 'failed'
      ? 'FAILED'
      : 'SURFACE';

  return {
    phase,
    subPhase,
    planetId: t.planetId,
    planetGravityG: t.planetGravityG,
    moonGravity: t.moonGravity,
    effectiveGravityMps2: t.effectiveGravityMps2,
    isAirborne: t.isAirborne,
    suitId: t.suitId,
    roverId: t.roverId,
    weatherIndex: t.weatherIndex,
    oxygen: t.oxygen,
    hypoxiaTimer: t.hypoxiaTimer,
    roverBattery: t.roverBattery,
    roverSpeedKmh: t.roverSpeedKmh,
    driving: t.driving,
    bunkerCount: t.bunkerCount,
    complete: t.phase === 'complete',
    failed: t.phase === 'failed',
    autoOrbit: t.autoOrbit,
    scannerTimer: t.scannerTimer,
    roverStateLabel: t.roverStatusText,
    prompt: t.promptText,
  };
}

export function PlanetSurvivalHUD({
  audio,
  quality,
  shuttleMaterial,
  muted,
  paused,
  startSurface = false,
  onToggleMute,
  onPause,
  onRestartPart2,
  onReplayPart1,
  onMainMenu,
  onCompletePart2,
}: PlanetSurvivalHUDProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PlanetSurvivalEngine | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [telemetry, setTelemetry] = useState<SurvivalTelemetry>(() =>
    makeInitialTelemetry(shuttleMaterial, startSurface)
  );
  const [toast, setToast] = useState<string | null>(null);
  const [hudHidden, setHudHidden] = useState(false);
  const [subModal, setSubModal] = useState<'none' | 'craft' | 'upgrade'>('none');
  const [craftMessage, setCraftMessage] = useState('Choose a blueprint to fabricate or use an owned item.');
  const [upgradeTab, setUpgradeTab] = useState<'planets' | 'suits' | 'rovers'>('planets');
  const [upgradeMessage, setUpgradeMessage] = useState('Select a category above to view stats and unlock options.');
  const [mobilePanel, setMobilePanel] = useState<'none' | 'mission' | 'inventory'>('none');
  const [completedPlanet, setCompletedPlanet] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const onCompleteRef = useRef(onCompletePart2);
  onCompleteRef.current = onCompletePart2;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const engine = new PlanetSurvivalEngine(
      mount,
      audio,
      {
        onTelemetry: (t) => setTelemetry(t),
        onToast: (msg) => showToast(msg),
        onMissionComplete: (planetName) => {
          setCompletedPlanet(planetName);
          setSubModal('none');
          onCompleteRef.current();
        },
        onMissionFailed: () => {
          setSubModal('none');
        },
      },
      quality,
      startSurface ? 'surface' : 'intro',
      shuttleMaterial
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    if (paused) {
      document.body.dataset.state = 'paused';
    } else if (telemetry.phase === 'complete' || telemetry.phase === 'failed' || completedPlanet) {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [paused, telemetry.phase, completedPlanet]);

  const phaseRef = useRef(telemetry.phase);
  phaseRef.current = telemetry.phase;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const subModalRef = useRef(subModal);
  subModalRef.current = subModal;

  useEffect(() => {
    const onEscapeCapture = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && subModalRef.current !== 'none' && !pausedRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSubModal('none');
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const k = e.key.toLowerCase();

      if (k === 'h') {
        setHudHidden((prev) => !prev);
        return;
      }

      engineRef.current?.setVirtualKey(k, true);

      if (phaseRef.current !== 'surface') return;
      if (e.code === 'Space') {
        e.preventDefault();
        engineRef.current?.triggerJump();
        return;
      }
      if (k === 'g') engineRef.current?.toggleMoonGravity();
      else if (k === 'r') engineRef.current?.toggleRoverDrive();
      else if (k === 'c') setSubModal((prev) => (prev === 'craft' ? 'none' : 'craft'));
      else if (k === 'u') setSubModal((prev) => (prev === 'upgrade' ? 'none' : 'upgrade'));
      else if (k === 'v') engineRef.current?.toggleAutoOrbit();
      else if (k === 'q') {
        const msg = engineRef.current?.useOxygenCanister();
        if (msg) setCraftMessage(msg);
      } else if (k === 'f') {
        const msg = engineRef.current?.useRoverRepair();
        if (msg) setCraftMessage(msg);
      } else if (k === 'b') {
        const msg = engineRef.current?.deployBunker();
        if (msg) {
          setCraftMessage(msg);
          setSubModal('none');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      engineRef.current?.setVirtualKey(e.key.toLowerCase(), false);
    };

    const onBlur = () => {
      engineRef.current?.clearKeys();
    };

    window.addEventListener('keydown', onEscapeCapture, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onEscapeCapture, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handleCraft = (kind: SurvivalCraftKind) => {
    const res = engineRef.current?.craft(kind);
    if (res) setCraftMessage(res.message);
  };

  const handleUseOxygen = useCallback(() => {
    const msg = engineRef.current?.useOxygenCanister();
    if (msg) setCraftMessage(msg);
  }, []);

  const handleUseRepair = useCallback(() => {
    const msg = engineRef.current?.useRoverRepair();
    if (msg) setCraftMessage(msg);
  }, []);

  const handleDeployBunker = useCallback(() => {
    const msg = engineRef.current?.deployBunker();
    if (msg) {
      setCraftMessage(msg);
      setSubModal('none');
    }
  }, []);

  const handleDeployBeacon = useCallback(() => {
    setSubModal('none');
    engineRef.current?.deployBeacon();
  }, []);

  const holdKey = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      engineRef.current?.setVirtualKey(key, true);
    },
    onPointerUp: () => engineRef.current?.setVirtualKey(key, false),
    onPointerLeave: () => engineRef.current?.setVirtualKey(key, false),
    onPointerCancel: () => engineRef.current?.setVirtualKey(key, false),
  });

  const hud = useMemo(() => toHudSnapshot(telemetry), [telemetry]);
  const { inventory } = telemetry;
  const landed = telemetry.phase === 'surface';
  const canUseO2 = landed && inventory.oxygenKits > 0 && telemetry.oxygen < 99.9;
  const canUseRepair = landed && inventory.repairKits > 0 && telemetry.roverBattery < 99.9;
  const canBuildBunker = landed && inventory.bunkerKits > 0;
  const canDeployBeacon = landed && inventory.beaconKits > 0;

  return (
    <div className="fixed inset-0 z-10 overflow-hidden" data-testid="part2-survival">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full" data-testid="survival-webgl-viewport" />

      {/* Replaced Part 2 HUD powered by GameHud */}
      {telemetry.phase !== 'intro' && (
        <GameHud
          hud={hud}
          inv={inventory}
          toast={toast}
          hudHidden={hudHidden}
          muted={muted}
          onToggleHud={() => setHudHidden((prev) => !prev)}
          onToggleMute={onToggleMute}
          onPause={onPause}
          onBeginLanding={() => engineRef.current?.beginLanding()}
          onScan={() => engineRef.current?.scan()}
          onOpenCraft={() => setSubModal('craft')}
          onOpenUpgrade={() => setSubModal('upgrade')}
          onToggleView={() => engineRef.current?.toggleAutoOrbit()}
          onUseOxygen={handleUseOxygen}
          onUseRepair={handleUseRepair}
          onDeployBunker={handleDeployBunker}
          onDeployBeacon={handleDeployBeacon}
          onJump={() => engineRef.current?.triggerJump()}
          onToggleMoonGravity={() => engineRef.current?.toggleMoonGravity()}
        />
      )}

      {/* Mobile Compact Strip & Drawers (< sm) */}
      {landed && !hudHidden && subModal === 'none' && (
        <>
          <div className="fixed top-[54px] left-2.5 right-2.5 z-20 flex sm:hidden items-center justify-between gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setMobilePanel((p) => (p === 'mission' ? 'none' : 'mission'))}
              className={`hud-surface rounded-lg px-2.5 py-1.5 text-[10px] font-display whitespace-nowrap ${
                telemetry.oxygen <= 0 ? 'text-rose-300 border-rose-500/50' : 'text-cyan-300'
              }`}
            >
              {telemetry.oxygen <= 0
                ? `HYPOXIA ${Math.ceil(telemetry.hypoxiaTimer)}s · O2 0%`
                : `TASKS (${telemetry.completedTasks}/4) · O2 ${Math.ceil(telemetry.oxygen)}%`}
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel((p) => (p === 'inventory' ? 'none' : 'inventory'))}
              className="hud-surface rounded-lg px-2.5 py-1.5 text-[10px] font-display text-slate-200 whitespace-nowrap"
            >
              CARGO ({inventory.ice}/{inventory.iron}/{inventory.silicon})
            </button>
          </div>

          {mobilePanel === 'mission' && (
            <aside className="fixed left-2.5 top-[90px] z-20 w-64 sm:hidden hud-surface rounded-xl p-3 text-[11px] pointer-events-auto">
              <div className="font-display font-bold text-cyan-300 mb-1.5">MISSION OBJECTIVES</div>
              <div className="space-y-1 text-slate-200">
                <div>{inventory.ice >= SURVIVAL_REQUIRED.ice ? '✓' : '○'} Water Ice ({inventory.ice}/3)</div>
                <div>{inventory.iron >= SURVIVAL_REQUIRED.iron ? '✓' : '○'} Iron Ore ({inventory.iron}/4)</div>
                <div>{inventory.silicon >= SURVIVAL_REQUIRED.silicon ? '✓' : '○'} Silicon ({inventory.silicon}/2)</div>
              </div>
              <button
                type="button"
                disabled={!canDeployBeacon}
                onClick={handleDeployBeacon}
                className="mt-2.5 w-full py-1.5 rounded bg-cyan-600 text-white font-display text-[10px] font-bold disabled:opacity-40"
              >
                DEPLOY RESEARCH BEACON
              </button>
            </aside>
          )}

          {mobilePanel === 'inventory' && (
            <aside className="fixed right-2.5 top-[90px] z-20 w-64 sm:hidden hud-surface rounded-xl p-3 text-[11px] pointer-events-auto space-y-1.5">
              <div className="font-display font-bold text-cyan-300">FIELD EQUIPMENT</div>
              <div className="flex justify-between text-slate-200">
                <span>O2 Canisters ({inventory.oxygenKits})</span>
                <button type="button" disabled={!canUseO2} onClick={handleUseOxygen} className="px-2 py-0.5 rounded bg-sky-700 text-white text-[9px] disabled:opacity-40">REFILL</button>
              </div>
              <div className="flex justify-between text-slate-200">
                <span>Repair Kits ({inventory.repairKits})</span>
                <button type="button" disabled={!canUseRepair} onClick={handleUseRepair} className="px-2 py-0.5 rounded bg-sky-700 text-white text-[9px] disabled:opacity-40">USE</button>
              </div>
              <div className="flex justify-between text-slate-200">
                <span>Bunker Kits ({inventory.bunkerKits})</span>
                <button type="button" disabled={!canBuildBunker} onClick={handleDeployBunker} className="px-2 py-0.5 rounded bg-teal-700 text-white text-[9px] disabled:opacity-40">BUILD</button>
              </div>
            </aside>
          )}

          {/* Mobile Touch D-Pad (< sm) */}
          <div className="fixed bottom-[120px] left-1/2 -translate-x-1/2 z-20 flex sm:hidden items-center justify-center gap-1.5 pointer-events-auto">
            <button type="button" {...holdKey('w')} className="nasa-btn-secondary px-2.5 py-1.5 rounded text-xs text-white">▲</button>
            <button type="button" {...holdKey('s')} className="nasa-btn-secondary px-2.5 py-1.5 rounded text-xs text-white">▼</button>
            <button type="button" {...holdKey('a')} className="nasa-btn-secondary px-2.5 py-1.5 rounded text-xs text-white">◀</button>
            <button type="button" {...holdKey('d')} className="nasa-btn-secondary px-2.5 py-1.5 rounded text-xs text-white">▶</button>
            <button
              type="button"
              data-testid="mobile-jump-btn"
              disabled={telemetry.driving}
              onClick={() => engineRef.current?.triggerJump()}
              className="nasa-btn-primary px-2.5 py-1.5 rounded text-[11px] font-display text-white disabled:opacity-40"
            >
              JUMP
            </button>
            <button type="button" {...holdKey('e')} className="nasa-btn-primary px-2.5 py-1.5 rounded text-[11px] font-display text-white">MINE</button>
            <button type="button" onClick={() => engineRef.current?.toggleRoverDrive()} className="nasa-btn-secondary px-2.5 py-1.5 rounded text-[11px] font-display text-cyan-200">
              {telemetry.driving ? 'EXIT' : 'ROVER'}
            </button>
          </div>
        </>
      )}

      {/* Intro Briefing Modal */}
      {telemetry.phase === 'intro' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75" data-testid="part2-intro-modal">
          <div className="hud-surface-strong rounded-2xl p-6 md:p-8 max-w-lg w-full">
            <p className="font-display text-xs tracking-[0.22em] text-sky-400">
              MOON MISSION · PART 2 EXPEDITION
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-black tracking-[0.1em] text-white">
              GALAXY COMMAND
            </h1>
            <p className="mt-1 font-display text-xs tracking-[0.16em] text-sky-300">
              PLANET SURVIVAL // KEPLER-186f
            </p>
            <p className="mt-4 text-sm text-slate-200 leading-relaxed">
              Following your historic lunar mission, Commander Alex Vega has reached deep-space exoplanet Kepler-186f. Land safely, drive the Pathfinder 6x6 Rover, mine Water Ice, Iron Ore, and Silicon, build Habitation Bunkers, and deploy a Research Beacon.
            </p>
            <div className="mt-4 rounded-lg bg-slate-900/75 border border-sky-500/20 p-3 text-xs text-slate-300 leading-relaxed">
              <strong>Controls:</strong> WASD / Arrows to walk or drive · <strong>SPACE</strong> to Jump (Moon Gravity 0.16g) · <strong>G</strong> Toggle Moon Gravity · Hold <strong>E</strong> to mine · <strong>R</strong> to enter/exit Rover · <strong>Q</strong> Refill Oxygen · <strong>F</strong> Repair Rover · <strong>B</strong> Build Bunker · <strong>C</strong> Crafting · <strong>U</strong> Planets &amp; Gear · <strong>H</strong> Toggle HUD.
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => engineRef.current?.enterOrbit()}
                className="nasa-btn-primary flex-1 py-3 px-6 rounded-lg font-display text-sm font-bold tracking-[0.16em] text-white cursor-pointer"
              >
                ENTER ORBIT
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="nasa-btn-secondary py-3 px-5 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-300 cursor-pointer"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Fabrication Modal [C] */}
      {subModal === 'craft' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
          <div className="hud-surface-strong rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto hud-scroll">
            <h2 className="font-display text-xl font-bold tracking-[0.14em] text-sky-300">
              FIELD FABRICATION
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Convert collected planetary materials into field equipment, bunkers, and outpost beacons.
            </p>

            <div className="mt-4 divide-y divide-white/10 text-xs">
              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong className="text-white text-sm">Oxygen Canister</strong>
                  <span className="ml-2 text-sky-300 font-mono-num">OWNED: {inventory.oxygenKits}</span>
                  <div className="text-slate-400 mt-0.5">Cost: 1 Water Ice · restores +35% suit oxygen [Q]</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleCraft('oxygen')} className="nasa-btn-secondary px-3 py-1.5 rounded font-display text-[11px] text-white cursor-pointer">CRAFT</button>
                  <button type="button" disabled={!canUseO2} onClick={handleUseOxygen} className="nasa-btn-primary px-3 py-1.5 rounded font-display text-[11px] text-white disabled:opacity-40 cursor-pointer">REFILL [Q]</button>
                </div>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong className="text-white text-sm">Rover Repair Kit</strong>
                  <span className="ml-2 text-sky-300 font-mono-num">OWNED: {inventory.repairKits}</span>
                  <div className="text-slate-400 mt-0.5">Cost: 2 Iron Ore + 1 Silicon · restores +50% battery [F]</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleCraft('repair')} className="nasa-btn-secondary px-3 py-1.5 rounded font-display text-[11px] text-white cursor-pointer">CRAFT</button>
                  <button type="button" disabled={!canUseRepair} onClick={handleUseRepair} className="nasa-btn-primary px-3 py-1.5 rounded font-display text-[11px] text-white disabled:opacity-40 cursor-pointer">USE [F]</button>
                </div>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong className="text-white text-sm">Habitation Bunker Kit</strong>
                  <span className="ml-2 text-sky-300 font-mono-num">OWNED: {inventory.bunkerKits}</span>
                  <div className="text-slate-400 mt-0.5">Cost: 2 Ice + 3 Iron + 2 Silicon · safe recharge shelter [B]</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleCraft('bunker')} className="nasa-btn-secondary px-3 py-1.5 rounded font-display text-[11px] text-white cursor-pointer">CRAFT</button>
                  <button type="button" disabled={!canBuildBunker} onClick={handleDeployBunker} className="nasa-btn-primary px-3 py-1.5 rounded font-display text-[11px] text-white disabled:opacity-40 cursor-pointer">BUILD [B]</button>
                </div>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong className="text-white text-sm">Research Beacon Kit</strong>
                  <span className="ml-2 text-sky-300 font-mono-num">OWNED: {inventory.beaconKits}</span>
                  <div className="text-slate-400 mt-0.5">Cost: 3 Ice + 4 Iron + 2 Silicon · completes expedition</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleCraft('beacon')} className="nasa-btn-secondary px-3 py-1.5 rounded font-display text-[11px] text-white cursor-pointer">CRAFT</button>
                  <button type="button" disabled={!canDeployBeacon} onClick={handleDeployBeacon} className="nasa-btn-primary px-3 py-1.5 rounded font-display text-[11px] text-white disabled:opacity-40 cursor-pointer">DEPLOY</button>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-sky-300">{craftMessage}</p>
            <button
              type="button"
              onClick={() => setSubModal('none')}
              className="mt-4 w-full nasa-btn-primary py-2.5 rounded-lg font-display text-xs font-bold tracking-[0.14em] text-white cursor-pointer"
            >
              CLOSE FABRICATION BAY
            </button>
          </div>
        </div>
      )}

      {/* Expedition & Armory Bay Modal [U] */}
      {subModal === 'upgrade' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
          <div className="hud-surface-strong rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto hud-scroll">
            <h2 className="font-display text-xl font-bold tracking-[0.14em] text-sky-300">
              EXPEDITION &amp; ARMORY BAY
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Spend collected planetary resources to unlock new worlds, exosuits, and specialized rovers.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {(['planets', 'suits', 'rovers'] as const).map((tab) => {
                const count =
                  tab === 'planets'
                    ? PLANET_CATALOG.length
                    : tab === 'suits'
                    ? SUIT_CATALOG.length
                    : ROVER_CATALOG.length;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setUpgradeTab(tab)}
                    className={`py-2 rounded-lg font-display text-xs uppercase tracking-wider cursor-pointer ${
                      upgradeTab === tab ? 'nasa-btn-primary text-white' : 'nasa-btn-secondary text-slate-300'
                    }`}
                  >
                    {tab} ({count})
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2.5">
              {upgradeTab === 'planets' &&
                PLANET_CATALOG.map((p) => {
                  const active = telemetry.planetId === p.id;
                  const unlocked = telemetry.unlockedPlanets.includes(p.id);
                  const afford = canAffordCost(inventory, p.cost);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                        active ? 'border-emerald-400 bg-emerald-950/25' : 'border-sky-500/25 bg-slate-900/60'
                      }`}
                    >
                      <div className="text-xs">
                        <div className="font-display font-bold text-white">{p.name}</div>
                        <div className="text-slate-400">{p.subtitle}</div>
                        <div className="text-sky-300 mt-0.5">{p.perk}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {unlocked ? 'Status: Unlocked' : `Unlock Cost: ${formatResourceCost(p.cost)}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={active || (!unlocked && !afford)}
                        onClick={() => {
                          const msg = engineRef.current?.selectOrUnlockPlanet(p.id as SurvivalPlanetId);
                          if (msg) setUpgradeMessage(msg);
                        }}
                        className="nasa-btn-primary px-3.5 py-2 rounded-lg font-display text-[11px] text-white disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        {active ? 'ACTIVE' : unlocked ? 'TRAVEL' : 'UNLOCK'}
                      </button>
                    </div>
                  );
                })}

              {upgradeTab === 'suits' &&
                SUIT_CATALOG.map((s) => {
                  const active = telemetry.suitId === s.id;
                  const unlocked = telemetry.unlockedSuits.includes(s.id);
                  const afford = canAffordCost(inventory, s.cost);
                  return (
                    <div
                      key={s.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                        active ? 'border-emerald-400 bg-emerald-950/25' : 'border-sky-500/25 bg-slate-900/60'
                      }`}
                    >
                      <div className="text-xs">
                        <div className="font-display font-bold text-white">{s.name}</div>
                        <div className="text-slate-400">{s.subtitle}</div>
                        <div className="text-sky-300 mt-0.5">{s.perk}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {unlocked ? 'Status: Unlocked' : `Unlock Cost: ${formatResourceCost(s.cost)}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={active || (!unlocked && !afford)}
                        onClick={() => {
                          const msg = engineRef.current?.selectOrUnlockSuit(s.id as SurvivalSuitId);
                          if (msg) setUpgradeMessage(msg);
                        }}
                        className="nasa-btn-primary px-3.5 py-2 rounded-lg font-display text-[11px] text-white disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        {active ? 'EQUIPPED' : unlocked ? 'EQUIP' : 'UNLOCK'}
                      </button>
                    </div>
                  );
                })}

              {upgradeTab === 'rovers' &&
                ROVER_CATALOG.map((r) => {
                  const active = telemetry.roverId === r.id;
                  const unlocked = telemetry.unlockedRovers.includes(r.id);
                  const afford = canAffordCost(inventory, r.cost);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                        active ? 'border-emerald-400 bg-emerald-950/25' : 'border-sky-500/25 bg-slate-900/60'
                      }`}
                    >
                      <div className="text-xs">
                        <div className="font-display font-bold text-white">{r.name}</div>
                        <div className="text-slate-400">{r.subtitle}</div>
                        <div className="text-sky-300 mt-0.5">{r.perk}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {unlocked ? 'Status: Unlocked' : `Unlock Cost: ${formatResourceCost(r.cost)}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={active || (!unlocked && !afford)}
                        onClick={() => {
                          const msg = engineRef.current?.selectOrUnlockRover(r.id as SurvivalRoverId);
                          if (msg) setUpgradeMessage(msg);
                        }}
                        className="nasa-btn-primary px-3.5 py-2 rounded-lg font-display text-[11px] text-white disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        {active ? 'DEPLOYED' : unlocked ? 'DEPLOY' : 'UNLOCK'}
                      </button>
                    </div>
                  );
                })}
            </div>

            <p className="mt-3 text-xs text-sky-300">{upgradeMessage}</p>
            <button
              type="button"
              onClick={() => setSubModal('none')}
              className="mt-4 w-full nasa-btn-primary py-2.5 rounded-lg font-display text-xs font-bold tracking-[0.14em] text-white cursor-pointer"
            >
              CLOSE EXPEDITION BAY
            </button>
          </div>
        </div>
      )}

      {/* Part 2 Complete Modal */}
      {(telemetry.phase === 'complete' || completedPlanet) && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75" data-testid="part2-complete-modal">
          <div className="hud-surface-strong rounded-2xl p-6 md:p-8 max-w-md w-full">
            <p className="font-display text-xs tracking-[0.22em] text-emerald-300">
              RESEARCH BEACON ONLINE
            </p>
            <h2 className="mt-1 font-display text-2xl font-black tracking-[0.12em] text-white">
              EXPEDITION COMPLETE
            </h2>
            <p className="mt-3 text-sm text-slate-200 leading-relaxed">
              Water Ice, Iron Ore, and Silicon were delivered on{' '}
              <strong className="text-sky-300">{completedPlanet ?? telemetry.planetName}</strong>.
              The first exoplanetary Research Beacon is active and transmitting!
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onRestartPart2}
                className="nasa-btn-primary px-5 py-3 rounded-lg font-display text-xs font-bold tracking-[0.14em] text-white cursor-pointer"
              >
                PLAY PART 2 AGAIN
              </button>
              <button
                type="button"
                onClick={onReplayPart1}
                className="nasa-btn-secondary px-4 py-3 rounded-lg font-display text-xs font-semibold text-sky-200 cursor-pointer"
              >
                REPLAY PART 1
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="nasa-btn-secondary px-4 py-3 rounded-lg font-display text-xs font-semibold text-slate-300 cursor-pointer"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part 2 Hypoxia Failure Modal */}
      {telemetry.phase === 'failed' && !completedPlanet && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75" data-testid="part2-failed-modal">
          <div className="hud-surface-strong rounded-2xl p-6 md:p-8 max-w-md w-full border border-rose-500/40">
            <p className="font-display text-xs tracking-[0.22em] text-rose-400">
              LIFE SUPPORT CRITICAL · SUIT HYPOXIA
            </p>
            <h2 className="mt-1 font-display text-2xl font-black tracking-[0.12em] text-white">
              EXPEDITION FAILED
            </h2>
            <p className="mt-3 text-sm text-slate-200 leading-relaxed">
              Commander Alex Vega lost consciousness after suit oxygen remained depleted for too long on{' '}
              <strong className="text-sky-300">{telemetry.planetName}</strong>. Return to the Shuttle Landing Pad or Habitation Bunkers periodically to replenish oxygen and scanner cells.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => engineRef.current?.retrySurface()}
                className="nasa-btn-primary flex-1 px-5 py-3 rounded-lg font-display text-xs font-bold tracking-[0.14em] text-white cursor-pointer"
              >
                RETRY AT SHUTTLE PAD
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="nasa-btn-secondary px-4 py-3 rounded-lg font-display text-xs font-semibold text-slate-300 cursor-pointer"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
