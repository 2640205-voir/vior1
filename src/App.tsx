import { useCallback, useEffect, useRef, useState } from 'react';
import { CustomizationOverlay } from './components/CustomizationOverlay';
import { LoadingScreen } from './components/LoadingScreen';
import { MainMenu } from './components/MainMenu';
import { MissionHUD } from './components/MissionHUD';
import { Modals } from './components/Modals';
import { PlanetSurvivalHUD } from './components/PlanetSurvivalHUD';
import { SpaceAudioEngine } from './game/audio';
import { MISSION2_DURATION_SEC, MOON_INITIAL_DISTANCE_KM } from './game/physics';
import { loadProgress, loadSettings, saveProgress, saveSettings } from './game/storage';
import { SpaceGameEngine, type EngineCallbacks } from './three/SpaceGameEngine';
import type {
  CompletedMissionStats,
  FlightInputState,
  GameProgress,
  GameScreen,
  GameSettings,
  MaterialId,
  Mission1Telemetry,
  Mission2Telemetry,
  Mission3Telemetry,
  ModalType,
} from './types/game';

const INITIAL_M1: Mission1Telemetry = {
  phase: 'ignition',
  altitudeKm: 0,
  velocityMs: 0,
  fuelPercent: 100,
  thrustKn: 0,
  weightKn: 0,
  vibration: 0,
  failed: false,
};

const INITIAL_M2: Mission2Telemetry = {
  distanceKm: MOON_INITIAL_DISTANCE_KM,
  speedKms: 10.6,
  shieldHitsRemaining: 3,
  maxShieldHits: 3,
  boostPercent: 100,
  isBoosting: false,
  elapsedSec: 0,
  targetDurationSec: MISSION2_DURATION_SEC,
  progressPercent: 0,
  obstaclesAvoided: 0,
  failed: false,
  damageFlashNonce: 0,
};

const INITIAL_M3: Mission3Telemetry = {
  phase: 'approach',
  altitudeM: 240,
  verticalSpeedMs: 12,
  gearDeployed: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SpaceGameEngine | null>(null);
  const audioRef = useRef<SpaceAudioEngine | null>(null);

  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [progress, setProgress] = useState<GameProgress>(() => loadProgress());
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>(() => loadProgress().lastMaterial);

  const [screen, setScreen] = useState<GameScreen>('loading');
  const [modal, setModal] = useState<ModalType>('none');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  const [mission1Telemetry, setMission1Telemetry] = useState<Mission1Telemetry>(INITIAL_M1);
  const [mission2Telemetry, setMission2Telemetry] = useState<Mission2Telemetry>(INITIAL_M2);
  const [mission3Telemetry, setMission3Telemetry] = useState<Mission3Telemetry>(INITIAL_M3);

  const [mission1Failed, setMission1Failed] = useState(false);
  const [mission2Failed, setMission2Failed] = useState(false);
  const [missionCompleteStats, setMissionCompleteStats] = useState<CompletedMissionStats | null>(null);
  const [survivalRunId, setSurvivalRunId] = useState(0);
  const [survivalStartSurface, setSurvivalStartSurface] = useState(false);

  const screenRef = useRef<GameScreen>(screen);
  screenRef.current = screen;
  const modalRef = useRef<ModalType>(modal);
  modalRef.current = modal;

  // Sync document.body.dataset.state for accessibility and automated verification
  useEffect(() => {
    if (screen === 'survival') return; // Managed by PlanetSurvivalHUD when Part 2 is active
    if (modal === 'pause') {
      document.body.dataset.state = 'paused';
    } else if (mission1Failed || mission2Failed || screen === 'complete') {
      document.body.dataset.state = 'gameover';
    } else if (screen === 'loading' || screen === 'menu') {
      document.body.dataset.state = 'title';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen, modal, mission1Failed, mission2Failed]);

  // Pause Part 1 WebGL render loop while Part 2 WebGL scene is active
  useEffect(() => {
    if (screen === 'survival') {
      engineRef.current?.setPaused(true);
    }
  }, [screen]);

  const updateSettings = useCallback((partial: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      audioRef.current?.setVolume(next.volume);
      audioRef.current?.setMuted(next.muted);
      if (partial.quality) {
        engineRef.current?.setQuality(partial.quality);
      }
      return next;
    });
  }, []);

  const handleSelectMaterial = useCallback((id: MaterialId) => {
    audioRef.current?.playUiClick();
    setSelectedMaterial(id);
    engineRef.current?.setMaterial(id);
    setProgress((prev) => {
      const next = { ...prev, lastMaterial: id };
      saveProgress(next);
      return next;
    });
  }, []);

  const startCustomization = useCallback(() => {
    audioRef.current?.init();
    audioRef.current?.playUiClick();
    audioRef.current?.startAmbient();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setModal('none');
    setScreen('customization');
    engineRef.current?.setPaused(false);
    engineRef.current?.enterCustomization();
  }, []);

  const goMainMenu = useCallback(() => {
    audioRef.current?.playUiClick();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setModal('none');
    setScreen('menu');
    engineRef.current?.setPaused(false);
    engineRef.current?.enterMainMenu();
  }, []);

  const launchMission1 = useCallback(() => {
    audioRef.current?.init();
    audioRef.current?.playUiClick();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setMission1Telemetry(INITIAL_M1);
    setModal('none');
    setScreen('mission1');
    engineRef.current?.setPaused(false);
    engineRef.current?.startMission1();
  }, []);

  const launchMission2 = useCallback(() => {
    audioRef.current?.init();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setMission2Telemetry(INITIAL_M2);
    setModal('none');
    setScreen('mission2');
    engineRef.current?.setPaused(false);
    engineRef.current?.startMission2();
  }, []);

  const launchMission3 = useCallback((stats?: Partial<CompletedMissionStats>) => {
    audioRef.current?.init();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setMission3Telemetry(INITIAL_M3);
    setModal('none');
    setScreen('mission3');
    engineRef.current?.setPaused(false);
    engineRef.current?.startMission3(stats);
  }, []);

  const launchPart2Survival = useCallback((startSurface = false) => {
    audioRef.current?.init();
    audioRef.current?.playUiClick();
    setMission1Failed(false);
    setMission2Failed(false);
    setMissionCompleteStats(null);
    setModal('none');
    engineRef.current?.setPaused(true);
    setSurvivalStartSurface(startSurface);
    setSurvivalRunId((n) => n + 1);
    setScreen('survival');
  }, []);

  const callbacksRef = useRef<EngineCallbacks>({
    onLoadingProgress: () => {},
    onLoadingComplete: () => {},
    onMission1Telemetry: () => {},
    onMission1Complete: () => {},
    onMission1Failed: () => {},
    onMission2Telemetry: () => {},
    onMission2Complete: () => {},
    onMission2Failed: () => {},
    onMission3Telemetry: () => {},
    onMission3Complete: () => {},
  });

  callbacksRef.current = {
    onLoadingProgress: (pct) => setLoadingProgress(pct),
    onLoadingComplete: () => {
      setScreen('menu');
      engineRef.current?.enterMainMenu();
    },
    onMission1Telemetry: (t) => setMission1Telemetry(t),
    onMission1Complete: () => {
      setProgress((prev) => {
        const next: GameProgress = {
          ...prev,
          highestMissionUnlocked: Math.max(prev.highestMissionUnlocked, 2) as 1 | 2 | 3,
        };
        saveProgress(next);
        return next;
      });
      launchMission2();
    },
    onMission1Failed: () => {
      setMission1Failed(true);
    },
    onMission2Telemetry: (t) => setMission2Telemetry(t),
    onMission2Complete: (stats) => {
      setProgress((prev) => {
        const next: GameProgress = {
          ...prev,
          highestMissionUnlocked: 3,
          bestFlightTime:
            prev.bestFlightTime === null
              ? stats.flightDurationSec
              : Math.min(prev.bestFlightTime, stats.flightDurationSec),
        };
        saveProgress(next);
        return next;
      });
      launchMission3(stats);
    },
    onMission2Failed: () => {
      setMission2Failed(true);
    },
    onMission3Telemetry: (t) => setMission3Telemetry(t),
    onMission3Complete: (stats) => {
      setProgress((prev) => {
        const next: GameProgress = {
          ...prev,
          highestMissionUnlocked: 3,
          missionsCompleted: prev.missionsCompleted + 1,
        };
        saveProgress(next);
        return next;
      });
      setScreen('complete');
      setMissionCompleteStats(stats);
    },
  };

  // Mount Three.js engine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const audio = new SpaceAudioEngine();
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
    audioRef.current = audio;

    try {
      const engine = new SpaceGameEngine(
        mount,
        audio,
        {
          onLoadingProgress: (p) => callbacksRef.current.onLoadingProgress(p),
          onLoadingComplete: () => callbacksRef.current.onLoadingComplete(),
          onMission1Telemetry: (t) => callbacksRef.current.onMission1Telemetry(t),
          onMission1Complete: () => callbacksRef.current.onMission1Complete(),
          onMission1Failed: () => callbacksRef.current.onMission1Failed(),
          onMission2Telemetry: (t) => callbacksRef.current.onMission2Telemetry(t),
          onMission2Complete: (s) => callbacksRef.current.onMission2Complete(s),
          onMission2Failed: () => callbacksRef.current.onMission2Failed(),
          onMission3Telemetry: (t) => callbacksRef.current.onMission3Telemetry(t),
          onMission3Complete: (s) => callbacksRef.current.onMission3Complete(s),
        },
        settings.quality,
        selectedMaterial
      );
      engineRef.current = engine;

      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart');
      if (autostart === '1') {
        setScreen('mission2');
        engine.startMission2();
      } else if (autostart === 'customize') {
        setScreen('customization');
        engine.enterCustomization();
      } else if (autostart === 'mission3') {
        setScreen('mission3');
        engine.startMission3();
      } else if (autostart === 'survival' || autostart === 'part2') {
        engine.setPaused(true);
        setSurvivalStartSurface(false);
        setScreen('survival');
      } else if (autostart === 'survival-surface') {
        engine.setPaused(true);
        setSurvivalStartSurface(true);
        setScreen('survival');
      }
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize 3D WebGL renderer.');
    }

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard controls (WASD, Arrows, Space, Escape, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const curScreen = screenRef.current;
      const curModal = modalRef.current;

      if (e.code === 'Escape') {
        if (curModal !== 'none' && curModal !== 'pause') {
          setModal('none');
          return;
        }
        if (
          curScreen === 'mission1' ||
          curScreen === 'mission2' ||
          curScreen === 'mission3' ||
          curScreen === 'survival'
        ) {
          const nextPaused = curModal !== 'pause';
          setModal(nextPaused ? 'pause' : 'none');
          if (curScreen !== 'survival') {
            engineRef.current?.setPaused(nextPaused);
            engineRef.current?.clearFlightInput();
          }
        }
        return;
      }

      if (curScreen === 'menu' && curModal === 'none' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startCustomization();
        return;
      }

      if (curScreen !== 'mission2' || curModal !== 'none') return;

      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        engineRef.current?.setFlightInput({ up: true });
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        engineRef.current?.setFlightInput({ down: true });
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        engineRef.current?.setFlightInput({ left: true });
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        engineRef.current?.setFlightInput({ right: true });
      } else if (e.code === 'Space') {
        e.preventDefault();
        engineRef.current?.setFlightInput({ boost: true });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        engineRef.current?.setFlightInput({ up: false });
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        engineRef.current?.setFlightInput({ down: false });
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        engineRef.current?.setFlightInput({ left: false });
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        engineRef.current?.setFlightInput({ right: false });
      } else if (e.code === 'Space') {
        engineRef.current?.setFlightInput({ boost: false });
      }
    };

    const handleBlur = () => {
      engineRef.current?.clearFlightInput();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [startCustomization]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handlePause = useCallback(() => {
    audioRef.current?.playUiClick();
    setModal('pause');
    engineRef.current?.setPaused(true);
    engineRef.current?.clearFlightInput();
  }, []);

  const handleResume = useCallback(() => {
    audioRef.current?.playUiClick();
    setModal('none');
    if (screen !== 'survival') {
      engineRef.current?.setPaused(false);
    }
  }, [screen]);

  const handleRestartCurrent = useCallback(() => {
    audioRef.current?.playUiClick();
    if (screen === 'mission1') launchMission1();
    else if (screen === 'mission2') launchMission2();
    else if (screen === 'mission3') launchMission3();
    else if (screen === 'survival') launchPart2Survival(false);
    else startCustomization();
  }, [screen, launchMission1, launchMission2, launchMission3, launchPart2Survival, startCustomization]);

  const handleSelectMissionFromMenu = useCallback(
    (mission: 1 | 2 | 3 | 4) => {
      audioRef.current?.playUiClick();
      if (mission === 1) startCustomization();
      else if (mission === 2) launchMission2();
      else if (mission === 3) launchMission3();
      else launchPart2Survival(false);
    },
    [startCustomization, launchMission2, launchMission3, launchPart2Survival]
  );

  const handleCompletePart2 = useCallback(() => {
    setProgress((prev) => {
      const next: GameProgress = {
        ...prev,
        part2CompletedCount: prev.part2CompletedCount + 1,
      };
      saveProgress(next);
      return next;
    });
  }, []);

  const handleFlightInput = useCallback((partial: Partial<FlightInputState>) => {
    engineRef.current?.setFlightInput(partial);
  }, []);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#030712]">
      {/* Isolated Part 1 WebGL Canvas Container (hidden during Part 2 so only one WebGL scene renders) */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-viewport"
        className={`fixed inset-0 w-full h-full ${screen === 'survival' ? 'hidden' : ''}`}
      />

      {webglError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950">
          <div className="hud-surface-strong rounded-xl p-6 max-w-md text-center">
            <h1 className="font-display text-xl font-bold text-white">MOON MISSION</h1>
            <p className="mt-3 text-sm text-rose-300">{webglError}</p>
          </div>
        </div>
      )}

      {screen === 'loading' && <LoadingScreen progress={loadingProgress} />}

      {screen === 'menu' && (
        <MainMenu
          onStart={startCustomization}
          onStartPart2={() => launchPart2Survival(false)}
          onOpenMissions={() => {
            audioRef.current?.playUiClick();
            setModal('missions');
          }}
          onOpenHelp={() => {
            audioRef.current?.playUiClick();
            setModal('help');
          }}
          onOpenSettings={() => {
            audioRef.current?.playUiClick();
            setModal('settings');
          }}
        />
      )}

      {screen === 'customization' && (
        <CustomizationOverlay
          selectedMaterial={selectedMaterial}
          onSelectMaterial={handleSelectMaterial}
          onLaunch={launchMission1}
          onBack={goMainMenu}
        />
      )}

      {(screen === 'mission1' || screen === 'mission2' || screen === 'mission3') && (
        <MissionHUD
          screen={screen}
          mission1={mission1Telemetry}
          mission2={mission2Telemetry}
          mission3={mission3Telemetry}
          muted={settings.muted}
          onToggleMute={() => updateSettings({ muted: !settings.muted })}
          onPause={handlePause}
          onFlightInput={handleFlightInput}
        />
      )}

      {screen === 'survival' && audioRef.current && (
        <PlanetSurvivalHUD
          key={survivalRunId}
          audio={audioRef.current}
          quality={settings.quality}
          shuttleMaterial={selectedMaterial}
          muted={settings.muted}
          paused={modal === 'pause'}
          startSurface={survivalStartSurface}
          onToggleMute={() => updateSettings({ muted: !settings.muted })}
          onPause={handlePause}
          onRestartPart2={() => launchPart2Survival(false)}
          onReplayPart1={startCustomization}
          onMainMenu={goMainMenu}
          onCompletePart2={handleCompletePart2}
        />
      )}

      <Modals
        modal={modal}
        settings={settings}
        progress={progress}
        mission1Failed={mission1Failed}
        mission2Failed={mission2Failed}
        missionCompleteStats={missionCompleteStats}
        onCloseModal={() => {
          audioRef.current?.playUiClick();
          setModal('none');
        }}
        onUpdateSettings={updateSettings}
        onToggleFullscreen={handleToggleFullscreen}
        onSelectMission={handleSelectMissionFromMenu}
        onResume={handleResume}
        onRestartCurrent={handleRestartCurrent}
        onMainMenu={goMainMenu}
        onRetryMission1={startCustomization}
        onRestartMission2={launchMission2}
        onPlayAgain={startCustomization}
        onContinuePart2={() => launchPart2Survival(false)}
      />
    </main>
  );
}
