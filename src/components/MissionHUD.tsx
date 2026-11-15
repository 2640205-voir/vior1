import { useEffect, useState } from 'react';
import type {
  FlightInputState,
  GameScreen,
  Mission1Telemetry,
  Mission2Telemetry,
  Mission3Telemetry,
} from '../types/game';

interface MissionHUDProps {
  screen: GameScreen;
  mission1: Mission1Telemetry;
  mission2: Mission2Telemetry;
  mission3: Mission3Telemetry;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onFlightInput: (partial: Partial<FlightInputState>) => void;
}

const PHASE_LABELS: Record<string, string> = {
  ignition: 'Phase 1 · Main Engine Ignition',
  liftoff: 'Phase 2 · Tower Clearance Liftoff',
  acceleration: 'Phase 3 · Max-Q Ascent Acceleration',
  atmosphere_exit: 'Phase 4 · Exosphere Exit',
  failed: 'Launch Anomaly · Thrust Insufficient',
};

const LANDING_LABELS: Record<string, string> = {
  approach: 'Lunar Orbit Approach',
  descent: 'Powered Terminal Descent',
  touchdown: 'Lunar Surface Touchdown',
  hatch_open: 'Depressurizing Airlock & Ramp',
  astronaut_walk: 'Lunar Surface EVA Deployment',
  flag_plant: 'Planting Lunar Flag',
  settled: 'Mission Accomplished',
};

export function MissionHUD({
  screen,
  mission1,
  mission2,
  mission3,
  muted,
  onToggleMute,
  onPause,
  onFlightInput,
}: MissionHUDProps) {
  const [showDamageFlash, setShowDamageFlash] = useState(false);

  useEffect(() => {
    if (mission2.damageFlashNonce <= 0) return;
    setShowDamageFlash(true);
    const id = window.setTimeout(() => setShowDamageFlash(false), 320);
    return () => window.clearTimeout(id);
  }, [mission2.damageFlashNonce]);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Peripheral red shield impact flash */}
      {showDamageFlash && (
        <div
          className="fixed inset-0 pointer-events-none border-[12px] border-rose-500/65 bg-rose-600/15"
          aria-hidden="true"
        />
      )}

      {/* Top HUD Row */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        {/* Top-Left Telemetry Cluster */}
        {screen === 'mission1' && (
          <div className="hud-surface px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl max-w-xs" data-testid="mission1-hud">
            <p className="text-[11px] uppercase tracking-[0.16em] text-sky-300 font-semibold">
              Mission 1 · Earth Launch
            </p>
            <p className="text-xs text-slate-200 mt-1">{PHASE_LABELS[mission1.phase] ?? mission1.phase}</p>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-2.5">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Altitude</span>
                <span className="font-mono-tabular text-sm sm:text-base font-bold text-white whitespace-nowrap">
                  {mission1.altitudeKm.toFixed(1)} km
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Velocity</span>
                <span className="font-mono-tabular text-sm sm:text-base font-bold text-white whitespace-nowrap">
                  {mission1.velocityMs} m/s
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Fuel</span>
                <span className="font-mono-tabular text-sm sm:text-base font-bold text-sky-300 whitespace-nowrap">
                  {mission1.fuelPercent}%
                </span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-sky-500/20 flex items-center justify-between gap-4 text-[11px] font-mono-tabular text-slate-300">
              <span>Thrust: {mission1.thrustKn.toLocaleString()} kN</span>
              <span>Weight: {mission1.weightKn.toLocaleString()} kN</span>
            </div>
          </div>
        )}

        {screen === 'mission2' && (
          <div className="hud-surface px-3 py-2 sm:px-4 sm:py-3 rounded-xl w-full sm:w-auto" data-testid="mission2-hud">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-sky-300 font-semibold">
              Mission 2 · Lunar Transit
            </p>
            <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-6 mt-1.5 sm:mt-2">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Distance to Moon</span>
                <span className="font-mono-tabular text-sm sm:text-lg font-bold text-white whitespace-nowrap">
                  {mission2.distanceKm.toLocaleString()} km
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Flight Speed</span>
                <span className="font-mono-tabular text-sm sm:text-lg font-bold text-sky-300 whitespace-nowrap">
                  {mission2.speedKms.toFixed(1)} km/s
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Avoided</span>
                <span className="font-mono-tabular text-sm sm:text-lg font-bold text-slate-100 whitespace-nowrap">
                  {mission2.obstaclesAvoided}
                </span>
              </div>
            </div>
          </div>
        )}

        {screen === 'mission3' && (
          <div className="hud-surface px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl" data-testid="mission3-hud">
            <p className="text-[11px] uppercase tracking-[0.16em] text-sky-300 font-semibold">
              Mission 3 · Lunar Landing
            </p>
            <p className="text-xs text-slate-100 mt-1">
              {LANDING_LABELS[mission3.phase] ?? mission3.phase}
            </p>
            <div className="flex items-center gap-5 mt-2">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Altitude</span>
                <span className="font-mono-tabular text-base font-bold text-white">
                  {mission3.altitudeM} m
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Gear</span>
                <span className="font-mono-tabular text-sm font-semibold text-sky-300">
                  {mission3.gearDeployed ? 'Deployed' : 'Stowed'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Top-Center Mission 2 Progress & Timer */}
        {screen === 'mission2' && (
          <div className="hidden md:flex hud-surface px-5 py-2.5 rounded-xl flex-col items-center min-w-[220px]">
            <div className="flex items-center justify-between w-full text-xs font-mono-tabular text-slate-200 mb-1.5">
              <span>{mission2.elapsedSec}s / {mission2.targetDurationSec}s</span>
              <span className="text-sky-300 font-bold">{mission2.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-sm overflow-hidden border border-sky-500/30">
              <div
                className="h-full bg-sky-400 transition-[width] duration-100"
                style={{ width: `${mission2.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Top-Right Shield/Boost & Utility Controls */}
        <div className="flex items-start justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto ml-auto">
          {screen === 'mission2' && (
            <div className="hud-surface px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl flex flex-col gap-1.5 flex-1 sm:flex-initial sm:min-w-[170px]">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Shield
                </span>
                <div className="flex items-center gap-1.5" aria-label={`Shields: ${mission2.shieldHitsRemaining} of ${mission2.maxShieldHits}`}>
                  {Array.from({ length: mission2.maxShieldHits }).map((_, idx) => {
                    const intact = idx < mission2.shieldHitsRemaining;
                    return (
                      <span
                        key={idx}
                        className={`w-4 h-2.5 rounded-xs border ${
                          intact
                            ? 'bg-sky-400 border-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.6)]'
                            : 'bg-slate-900 border-rose-500/50'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <span>Boost</span>
                  <span className="font-mono-tabular text-sky-300">{mission2.boostPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-xs overflow-hidden border border-sky-500/25">
                  <div
                    className={`h-full transition-[width] duration-75 ${
                      mission2.isBoosting ? 'bg-cyan-300' : 'bg-sky-500'
                    }`}
                    style={{ width: `${mission2.boostPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="hud-surface px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-lg text-[11px] sm:text-xs font-display font-semibold text-slate-100 hover:border-sky-400 cursor-pointer whitespace-nowrap"
            >
              {muted ? 'SOUND OFF' : 'SOUND ON'}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="hud-surface px-2.5 py-2 sm:px-3.5 sm:py-2.5 rounded-lg text-[11px] sm:text-xs font-display font-semibold text-white hover:border-sky-400 cursor-pointer whitespace-nowrap"
            >
              PAUSE
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Mobile & On-Screen Touch Flight Controls during Mission 2 */}
      {screen === 'mission2' && (
        <div className="flex items-end justify-between gap-4">
          {/* Directional Pad */}
          <div
            className="grid grid-cols-3 gap-1.5 w-36 pointer-events-auto"
            aria-label="Flight Directional Controls"
          >
            <div />
            <button
              type="button"
              aria-label="Move Up"
              onPointerDown={() => onFlightInput({ up: true })}
              onPointerUp={() => onFlightInput({ up: false })}
              onPointerLeave={() => onFlightInput({ up: false })}
              onPointerCancel={() => onFlightInput({ up: false })}
              className="hud-surface h-11 rounded-lg font-display text-sm font-bold text-white active:bg-sky-500/40 cursor-pointer"
            >
              ▲
            </button>
            <div />

            <button
              type="button"
              aria-label="Move Left"
              onPointerDown={() => onFlightInput({ left: true })}
              onPointerUp={() => onFlightInput({ left: false })}
              onPointerLeave={() => onFlightInput({ left: false })}
              onPointerCancel={() => onFlightInput({ left: false })}
              className="hud-surface h-11 rounded-lg font-display text-sm font-bold text-white active:bg-sky-500/40 cursor-pointer"
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Move Down"
              onPointerDown={() => onFlightInput({ down: true })}
              onPointerUp={() => onFlightInput({ down: false })}
              onPointerLeave={() => onFlightInput({ down: false })}
              onPointerCancel={() => onFlightInput({ down: false })}
              className="hud-surface h-11 rounded-lg font-display text-sm font-bold text-white active:bg-sky-500/40 cursor-pointer"
            >
              ▼
            </button>
            <button
              type="button"
              aria-label="Move Right"
              onPointerDown={() => onFlightInput({ right: true })}
              onPointerUp={() => onFlightInput({ right: false })}
              onPointerLeave={() => onFlightInput({ right: false })}
              onPointerCancel={() => onFlightInput({ right: false })}
              className="hud-surface h-11 rounded-lg font-display text-sm font-bold text-white active:bg-sky-500/40 cursor-pointer"
            >
              ▶
            </button>
          </div>

          <p className="hidden md:block text-xs text-slate-400">
            WASD / Arrows Steer · Space Boost · Esc Pause
          </p>

          {/* Boost Button */}
          <button
            type="button"
            aria-label="Activate Boost"
            onPointerDown={() => onFlightInput({ boost: true })}
            onPointerUp={() => onFlightInput({ boost: false })}
            onPointerLeave={() => onFlightInput({ boost: false })}
            onPointerCancel={() => onFlightInput({ boost: false })}
            className="nasa-btn-primary pointer-events-auto px-6 py-4 rounded-xl font-display text-xs md:text-sm font-bold tracking-[0.16em] text-white active:scale-95 cursor-pointer"
          >
            BOOST
          </button>
        </div>
      )}
    </div>
  );
}
