import { MATERIAL_DISCLAIMER, MATERIAL_ORDER, SHUTTLE_MATERIALS } from '../game/materials';
import type { MaterialId } from '../types/game';

interface CustomizationOverlayProps {
  selectedMaterial: MaterialId;
  onSelectMaterial: (id: MaterialId) => void;
  onLaunch: () => void;
  onBack: () => void;
}

export function CustomizationOverlay({
  selectedMaterial,
  onSelectMaterial,
  onLaunch,
  onBack,
}: CustomizationOverlayProps) {
  const mat = SHUTTLE_MATERIALS[selectedMaterial];

  const suitabilityColor =
    mat.launchSuitability === 'Excellent' || mat.launchSuitability === 'Good'
      ? 'text-emerald-300'
      : mat.launchSuitability === 'Moderate'
      ? 'text-amber-300'
      : 'text-rose-400';

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-4 md:p-6 pointer-events-none"
      data-testid="customization-overlay"
    >
      {/* Top Minimal Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="hud-surface px-4 py-2.5 rounded-lg pointer-events-auto">
          <h2 className="font-display text-sm md:text-base font-bold tracking-[0.16em] text-white">
            SHUTTLE CONFIGURATION
          </h2>
          <p className="text-xs text-sky-300/90 mt-0.5">
            Drag anywhere on the viewport to inspect the orbiter in 360°
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="nasa-btn-secondary pointer-events-auto px-4 py-2.5 rounded-lg text-xs font-display font-semibold tracking-[0.14em] text-slate-200 whitespace-nowrap cursor-pointer"
        >
          MAIN MENU
        </button>
      </div>

      {/* Unified Bottom Control Dock leaving center 3D shuttle 100% unobstructed */}
      <div className="w-full max-w-5xl mx-auto pointer-events-auto">
        <div className="hud-surface-strong rounded-xl p-4 md:p-5 flex flex-col gap-4">
          {/* Material Selector Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Shuttle Hull Material">
              {MATERIAL_ORDER.map((id) => {
                const item = SHUTTLE_MATERIALS[id];
                const active = id === selectedMaterial;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSelectMaterial(id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-display font-semibold tracking-[0.12em] flex items-center gap-2.5 whitespace-nowrap cursor-pointer transition-all ${
                      active
                        ? 'bg-sky-500/25 border border-sky-400 text-white shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                        : 'bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:border-sky-400/60 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0"
                      style={{ backgroundColor: item.swatchCss }}
                      aria-hidden="true"
                    />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onLaunch}
              className="nasa-btn-primary px-7 py-3 rounded-lg font-display text-sm md:text-base font-extrabold tracking-[0.2em] text-white whitespace-nowrap cursor-pointer"
            >
              LAUNCH
            </button>
          </div>

          {/* Dynamic Material Information Card */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-sky-500/20">
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Selected Material
              </span>
              <span className="font-display text-sm font-bold text-white">{mat.name}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Density
              </span>
              <span className="font-mono-tabular text-sm font-semibold text-sky-300">
                {mat.densityLabel}
              </span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Weight Classification
              </span>
              <span className="text-sm font-semibold text-slate-100">{mat.weightClass}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Heat Resistance
              </span>
              <span className="text-sm font-semibold text-slate-100">{mat.heatResistance}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">
                Launch Suitability
              </span>
              <span className={`text-sm font-bold ${suitabilityColor}`}>{mat.launchSuitability}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            {MATERIAL_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
