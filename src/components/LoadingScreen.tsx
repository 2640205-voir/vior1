interface LoadingScreenProps {
  progress: number;
}

export function LoadingScreen({ progress }: LoadingScreenProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none"
      data-testid="loading-screen"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="w-9 h-9 text-sky-400" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
            <path d="M20 6 L25 22 L20 19 L15 22 Z" fill="currentColor" />
            <path d="M10 27 Q20 22 30 27" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
          </svg>
          <div>
            <p className="font-display text-sm tracking-[0.26em] text-sky-300">MOON MISSION</p>
            <p className="text-xs text-slate-400 tracking-wide">Lunar Transfer Simulation</p>
          </div>
        </div>
        <span className="font-mono-tabular text-xs text-sky-300/80">
          Pre-Flight Initialization
        </span>
      </div>

      <div className="max-w-xl w-full mx-auto">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium tracking-[0.2em] text-slate-300 uppercase">
            Preparing Orbital Systems
          </span>
          <span className="font-mono-tabular text-2xl font-bold text-sky-300">
            {progress}%
          </span>
        </div>
        <div className="h-2 w-full bg-slate-900/90 border border-sky-500/30 rounded-sm overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-[width] duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-center text-xs tracking-[0.22em] text-slate-400 uppercase">
          FROM EARTH TO THE MOON. ONE MISSION. ONE DESTINATION.
        </p>
      </div>
    </div>
  );
}
