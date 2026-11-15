import { LAUNCH_FAILURE_REASON } from '../game/materials';
import type {
  CompletedMissionStats,
  GameProgress,
  GameSettings,
  GraphicsQuality,
  ModalType,
} from '../types/game';

interface ModalsProps {
  modal: ModalType;
  settings: GameSettings;
  progress: GameProgress;
  mission1Failed: boolean;
  mission2Failed: boolean;
  missionCompleteStats: CompletedMissionStats | null;
  onCloseModal: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onToggleFullscreen: () => void;
  onSelectMission: (mission: 1 | 2 | 3 | 4) => void;
  onResume: () => void;
  onRestartCurrent: () => void;
  onMainMenu: () => void;
  onRetryMission1: () => void;
  onRestartMission2: () => void;
  onPlayAgain: () => void;
  onContinuePart2: () => void;
}

export function Modals({
  modal,
  settings,
  progress,
  mission1Failed,
  mission2Failed,
  missionCompleteStats,
  onCloseModal,
  onUpdateSettings,
  onToggleFullscreen,
  onSelectMission,
  onResume,
  onRestartCurrent,
  onMainMenu,
  onRetryMission1,
  onRestartMission2,
  onPlayAgain,
  onContinuePart2,
}: ModalsProps) {
  // 1. Mission 1 Launch Failure Modal
  if (mission1Failed) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60" data-testid="mission1-failed-modal">
        <div className="hud-surface-strong border-rose-500/70 rounded-xl p-6 md:p-8 max-w-lg w-full">
          <p className="font-display text-2xl font-extrabold tracking-[0.12em] text-rose-400">
            MISSION FAILED!
          </p>
          <p className="mt-4 text-sm md:text-base text-slate-100 leading-relaxed">
            Reason: {LAUNCH_FAILURE_REASON}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRetryMission1}
              className="nasa-btn-primary px-6 py-3 rounded-lg font-display text-sm font-bold tracking-[0.16em] text-white cursor-pointer"
            >
              RETRY
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="nasa-btn-secondary px-5 py-3 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-200 cursor-pointer"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Mission 2 Shield Depletion Failure Modal
  if (mission2Failed) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60" data-testid="mission2-failed-modal">
        <div className="hud-surface-strong border-rose-500/70 rounded-xl p-6 md:p-8 max-w-md w-full">
          <p className="font-display text-2xl font-extrabold tracking-[0.12em] text-rose-400">
            MISSION FAILED
          </p>
          <p className="mt-3 text-sm text-slate-200 leading-relaxed">
            Hull shield integrity reached zero after three orbital debris impacts. Re-engage orbital transit without repeating launch configuration.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onRestartMission2}
              className="nasa-btn-primary px-6 py-3 rounded-lg font-display text-sm font-bold tracking-[0.14em] text-white cursor-pointer"
            >
              RESTART MISSION 2
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="nasa-btn-secondary px-5 py-3 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-200 cursor-pointer"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Mission Complete Modal (positioned cleanly on left so landed shuttle, astronauts & waving flag remain visible)
  if (missionCompleteStats) {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-start p-6 md:p-12 pointer-events-none"
        data-testid="mission-complete-modal"
      >
        <div className="hud-surface-strong rounded-xl p-6 md:p-8 max-w-md w-full pointer-events-auto">
          <h2 className="font-display text-3xl font-black tracking-[0.12em] text-white">
            MISSION COMPLETE
          </h2>
          <p className="font-display text-sm tracking-[0.26em] text-sky-300 mt-1">
            THE END
          </p>

          <dl className="mt-6 space-y-2.5 text-sm border-t border-b border-sky-500/20 py-4">
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">Mission</dt>
              <dd className="font-semibold text-white">Earth to Moon</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">Shuttle Material</dt>
              <dd className="font-display text-sky-300 font-semibold">{missionCompleteStats.material}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">Flight Duration</dt>
              <dd className="font-mono-tabular text-white font-semibold">{missionCompleteStats.flightDurationSec}s</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">Obstacles Avoided</dt>
              <dd className="font-mono-tabular text-white font-semibold">{missionCompleteStats.obstaclesAvoided}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">Landing Status</dt>
              <dd className="text-emerald-300 font-semibold">Successful Landing</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onContinuePart2}
              className="nasa-btn-primary w-full px-6 py-3.5 rounded-lg font-display text-sm font-bold tracking-[0.14em] text-white cursor-pointer"
            >
              CONTINUE TO PART 2: PLANET SURVIVAL →
            </button>
            <button
              type="button"
              onClick={onPlayAgain}
              className="nasa-btn-secondary px-5 py-2.5 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-sky-200 cursor-pointer"
            >
              PLAY PART 1 AGAIN
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="nasa-btn-secondary px-5 py-2.5 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-200 cursor-pointer"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal === 'none') return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65" data-testid={`modal-${modal}`}>
      <div className="hud-surface-strong rounded-xl p-6 md:p-8 max-w-lg w-full">
        {modal === 'help' && (
          <>
            <h2 className="font-display text-xl font-bold tracking-[0.14em] text-white">
              FLIGHT MANUAL & CONTROLS
            </h2>
            <div className="mt-5 space-y-4 text-sm text-slate-200">
              <div>
                <h3 className="font-display text-xs tracking-[0.16em] text-sky-300 uppercase mb-2">
                  CONTROLS
                </h3>
                <ul className="space-y-1.5 font-mono-tabular text-xs sm:text-sm">
                  <li><span className="text-sky-300 font-semibold">W / Up Arrow:</span> Move forward or upward.</li>
                  <li><span className="text-sky-300 font-semibold">S / Down Arrow:</span> Move downward.</li>
                  <li><span className="text-sky-300 font-semibold">A / Left Arrow:</span> Move left.</li>
                  <li><span className="text-sky-300 font-semibold">D / Right Arrow:</span> Move right.</li>
                  <li><span className="text-sky-300 font-semibold">SPACE:</span> Activate thrust/boost.</li>
                  <li><span className="text-sky-300 font-semibold">ESC:</span> Pause the game.</li>
                </ul>
              </div>
              <div className="pt-3 border-t border-sky-500/20">
                <h3 className="font-display text-xs tracking-[0.16em] text-sky-300 uppercase mb-1.5">
                  PART 2 · PLANET SURVIVAL
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  WASD move/drive · SPACE Jump · G Moon Gravity (0.16g) · Hold E to mine deposits · R enter/exit Rover · Q refill O2 · F repair Rover · B deploy Bunker · C Crafting · U Planets &amp; Gear.
                </p>
              </div>
              <div className="pt-3 border-t border-sky-500/20">
                <h3 className="font-display text-xs tracking-[0.16em] text-sky-300 uppercase mb-1.5">
                  OBJECTIVE
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  Launch from Earth, navigate outer space, land safely on the Moon, and continue to Kepler-186f to deploy a Research Beacon.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onCloseModal}
                className="nasa-btn-primary px-6 py-2.5 rounded-lg font-display text-xs font-bold tracking-[0.16em] text-white cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </>
        )}

        {modal === 'settings' && (
          <>
            <h2 className="font-display text-xl font-bold tracking-[0.14em] text-white">
              SYSTEM SETTINGS
            </h2>
            <div className="mt-5 space-y-5 text-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="volume-range" className="text-slate-200 font-medium">
                    Audio Volume
                  </label>
                  <span className="font-mono-tabular text-sky-300">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  id="volume-range"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.volume * 100)}
                  onChange={(e) => onUpdateSettings({ volume: Number(e.target.value) / 100 })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-medium">Master Audio</span>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ muted: !settings.muted })}
                  className="nasa-btn-secondary px-4 py-2 rounded-lg font-display text-xs font-semibold text-white cursor-pointer"
                >
                  {settings.muted ? 'SOUND OFF' : 'SOUND ON'}
                </button>
              </div>

              <div>
                <span className="block text-slate-200 font-medium mb-2">Graphics Quality</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onUpdateSettings({ quality: q })}
                      className={`py-2 rounded-lg font-display text-xs uppercase tracking-wider cursor-pointer ${
                        settings.quality === q
                          ? 'bg-sky-500/30 border border-sky-400 text-white'
                          : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-sky-400/50'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-sky-500/20">
                <span className="text-slate-200 font-medium">Display Mode</span>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="nasa-btn-secondary px-4 py-2 rounded-lg font-display text-xs font-semibold text-white cursor-pointer"
                >
                  TOGGLE FULLSCREEN
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onCloseModal}
                className="nasa-btn-primary px-6 py-2.5 rounded-lg font-display text-xs font-bold tracking-[0.16em] text-white cursor-pointer"
              >
                SAVE & CLOSE
              </button>
            </div>
          </>
        )}

        {modal === 'missions' && (
          <>
            <h2 className="font-display text-xl font-bold tracking-[0.14em] text-white">
              GAMES / MISSIONS
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Part 1 Completions: <span className="font-mono-tabular text-sky-300">{progress.missionsCompleted}</span>
              {' · '}Part 2 Expeditions: <span className="font-mono-tabular text-emerald-300">{progress.part2CompletedCount}</span>
              {progress.bestFlightTime ? ` · Best Transit: ${progress.bestFlightTime}s` : ''}
            </p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => onSelectMission(1)}
                className="w-full nasa-btn-secondary p-4 rounded-xl text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-display text-sm font-bold text-white">MISSION 1 · EARTH LAUNCH</p>
                  <p className="text-xs text-slate-300 mt-0.5">Configure shuttle hull material and ignite liftoff.</p>
                </div>
                <span className="font-display text-xs text-sky-300">PLAY</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectMission(2)}
                className="w-full nasa-btn-secondary p-4 rounded-xl text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-display text-sm font-bold text-white">MISSION 2 · OUTER SPACE FLIGHT</p>
                  <p className="text-xs text-slate-300 mt-0.5">60-second lunar transit avoiding asteroids & debris.</p>
                </div>
                <span className="font-display text-xs text-sky-300">PLAY</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectMission(3)}
                className="w-full nasa-btn-secondary p-4 rounded-xl text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-display text-sm font-bold text-white">MISSION 3 · LUNAR LANDING</p>
                  <p className="text-xs text-slate-300 mt-0.5">Cinematic Moon touchdown and astronaut flag deployment.</p>
                </div>
                <span className="font-display text-xs text-sky-300">PLAY</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectMission(4)}
                className="w-full nasa-btn-primary p-4 rounded-xl text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-display text-sm font-bold text-white">PART 2 · PLANET SURVIVAL</p>
                  <p className="text-xs text-sky-100/90 mt-0.5">Kepler-186f expedition: Rover, Mining, Bunkers &amp; Beacon.</p>
                </div>
                <span className="font-display text-xs text-emerald-200">PLAY</span>
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onCloseModal}
                className="nasa-btn-secondary px-5 py-2.5 rounded-lg font-display text-xs font-semibold text-slate-200 cursor-pointer"
              >
                BACK
              </button>
            </div>
          </>
        )}

        {modal === 'pause' && (
          <>
            <h2 className="font-display text-2xl font-bold tracking-[0.16em] text-white">
              MISSION PAUSED
            </h2>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={onResume}
                className="nasa-btn-primary px-6 py-3 rounded-lg font-display text-sm font-bold tracking-[0.16em] text-white cursor-pointer"
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={onRestartCurrent}
                className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-100 cursor-pointer"
              >
                RESTART MISSION
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ muted: !settings.muted })}
                  className="nasa-btn-secondary py-2.5 rounded-lg font-display text-xs font-semibold text-slate-100 cursor-pointer"
                >
                  {settings.muted ? 'SOUND OFF' : 'SOUND ON'}
                </button>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="nasa-btn-secondary py-2.5 rounded-lg font-display text-xs font-semibold text-slate-100 cursor-pointer"
                >
                  FULLSCREEN
                </button>
              </div>
              <button
                type="button"
                onClick={onMainMenu}
                className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-xs font-semibold tracking-[0.14em] text-slate-300 cursor-pointer"
              >
                MAIN MENU
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
