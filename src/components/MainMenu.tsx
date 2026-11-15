interface MainMenuProps {
  onStart: () => void;
  onStartPart2: () => void;
  onOpenMissions: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}

export function MainMenu({
  onStart,
  onStartPart2,
  onOpenMissions,
  onOpenHelp,
  onOpenSettings,
}: MainMenuProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-12 pointer-events-none bg-gradient-to-r from-[#030712]/85 via-[#030712]/40 to-transparent"
      data-testid="main-menu"
    >
      {/* Top Aerospace Header Lockup */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 44 44" className="w-10 h-10 text-sky-400 shrink-0" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <ellipse cx="22" cy="22" rx="19" ry="7" fill="none" stroke="#7dd3fc" strokeWidth="1.2" transform="rotate(-24 22 22)" />
            <path d="M22 7 L27 24 L22 21 L17 24 Z" fill="#f8fafc" />
          </svg>
          <span className="text-xs font-medium tracking-[0.22em] text-sky-300 uppercase">
            Orbital Flight Simulator
          </span>
        </div>
      </div>

      {/* Left-third Title & Action Stack leaving 3D Shuttle & Earth unobstructed */}
      <div className="max-w-lg my-auto pointer-events-auto">
        <div className="mb-8">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-[0.08em] text-white leading-[1.05] text-balance drop-shadow-[0_4px_24px_rgba(2,132,199,0.45)]">
            MOON MISSION
          </h1>
          <p className="mt-3 font-display text-sm sm:text-base tracking-[0.22em] text-sky-300">
            BEYOND EARTH. TOWARDS THE MOON.
          </p>
          <p className="mt-3 text-sm text-slate-300/90 max-w-md leading-relaxed">
            FROM EARTH TO THE MOON — AND ONWARD TO KEPLER-186f.
          </p>
        </div>

        <nav aria-label="Main Menu" className="flex flex-col gap-3 w-full max-w-xs">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="nasa-btn-primary px-6 py-3.5 rounded-lg font-display text-base font-bold tracking-[0.18em] text-white text-left flex items-center justify-between whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-300"
          >
            <span>START PART 1</span>
            <span aria-hidden="true" className="text-sky-200 text-lg">→</span>
          </button>

          <button
            type="button"
            onClick={onStartPart2}
            className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-xs sm:text-sm font-semibold tracking-[0.13em] text-sky-200 text-left flex items-center justify-between whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-300"
          >
            <span>PART 2 · SURVIVAL</span>
            <span aria-hidden="true" className="text-emerald-300 text-sm">→</span>
          </button>

          <button
            type="button"
            onClick={onOpenMissions}
            className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-sm font-semibold tracking-[0.14em] text-slate-100 text-left flex items-center justify-between whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-300"
          >
            <span>GAMES / MISSIONS</span>
            <span aria-hidden="true" className="text-sky-400 text-sm">01–04</span>
          </button>

          <button
            type="button"
            onClick={onOpenHelp}
            className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-sm font-semibold tracking-[0.14em] text-slate-100 text-left flex items-center justify-between whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-300"
          >
            <span>HELP</span>
            <span aria-hidden="true" className="text-sky-400 text-sm">?</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="nasa-btn-secondary px-6 py-3 rounded-lg font-display text-sm font-semibold tracking-[0.14em] text-slate-100 text-left flex items-center justify-between whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-300"
          >
            <span>SETTINGS</span>
            <span aria-hidden="true" className="text-sky-400 text-sm">⚙</span>
          </button>
        </nav>
      </div>

      {/* Flat borderless bottom control hint */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span>WASD / Arrows Move · Space Boost · Esc Pause · Enter Start</span>
      </div>
    </div>
  );
}
