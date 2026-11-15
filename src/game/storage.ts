import type { GameProgress, GameSettings } from '../types/game';

const SETTINGS_KEY = 'moon_mission_settings_v1';
const PROGRESS_KEY = 'moon_mission_progress_v1';

const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  muted: false,
  quality: 'high',
};

const DEFAULT_PROGRESS: GameProgress = {
  highestMissionUnlocked: 1,
  missionsCompleted: 0,
  bestFlightTime: null,
  lastMaterial: 'TITANIUM',
  part2CompletedCount: 0,
};

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULT_SETTINGS.volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
      quality:
        parsed.quality === 'high' || parsed.quality === 'medium' || parsed.quality === 'low'
          ? parsed.quality
          : DEFAULT_SETTINGS.quality,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function loadProgress(): GameProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<GameProgress>;
    return {
      highestMissionUnlocked:
        parsed.highestMissionUnlocked === 1 ||
        parsed.highestMissionUnlocked === 2 ||
        parsed.highestMissionUnlocked === 3
          ? parsed.highestMissionUnlocked
          : 1,
      missionsCompleted:
        typeof parsed.missionsCompleted === 'number' && parsed.missionsCompleted >= 0
          ? parsed.missionsCompleted
          : 0,
      bestFlightTime:
        typeof parsed.bestFlightTime === 'number' && parsed.bestFlightTime > 0
          ? parsed.bestFlightTime
          : null,
      lastMaterial:
        parsed.lastMaterial === 'ALUMINIUM' ||
        parsed.lastMaterial === 'SILVER' ||
        parsed.lastMaterial === 'GOLD' ||
        parsed.lastMaterial === 'TITANIUM' ||
        parsed.lastMaterial === 'IRON'
          ? parsed.lastMaterial
          : DEFAULT_PROGRESS.lastMaterial,
      part2CompletedCount:
        typeof parsed.part2CompletedCount === 'number' && parsed.part2CompletedCount >= 0
          ? parsed.part2CompletedCount
          : 0,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(progress: GameProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}
