import {
  Building2,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  Mountain,
  Move,
  Navigation,
  RotateCcw,
  Thermometer,
  Trash2,
  TreePine,
  Trees,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  BASEMAP_STYLE_OPTIONS,
  CAMERA_PRESETS,
  type BasemapStyleId,
  type CameraPreset,
  type ToolMode,
} from '../types/scenario';
import { TOOL_DEFINITIONS } from '../tools/toolDefinitions';
import { TEMP_MAX_C, TEMP_MIN_C } from '../layers/surfaceTemperatureLayer';

interface ToolbarProps {
  activeTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  onLoadOsmTrees: () => void;
  isLoadingOsmTrees: boolean;
  osmTreesCount: number;
  showOsmTrees: boolean;
  onToggleShowOsmTrees: () => void;
  osmError: string | null;
  modifiedExistingCount: number;
  onResetAllExistingHeights: () => void;
  showSurfaceTemperature: boolean;
  onToggleSurfaceTemperature: () => void;
  basemapStyle: BasemapStyleId;
  onChangeBasemapStyle: (style: BasemapStyleId) => void;
  showTerrain3D: boolean;
  onToggleTerrain3D: () => void;
  terrainExaggeration: number;
  onChangeTerrainExaggeration: (value: number) => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onResetCamera: () => void;
}

const TOOL_ICONS: Record<ToolMode, ComponentType<{ className?: string }>> = {
  view: Navigation,
  'add-building': Building2,
  'add-tree': TreePine,
  transform: Move,
  delete: Trash2,
};

/**
 * Barra laterale sinistra con i 5 strumenti dell'editor, il caricamento degli
 * alberi OSM esistenti, la basemap 2D + rilievi 3D del terreno e il layer Temperatura al suolo.
 */
export function Toolbar({
  activeTool,
  onSelectTool,
  onLoadOsmTrees,
  isLoadingOsmTrees,
  osmTreesCount,
  showOsmTrees,
  onToggleShowOsmTrees,
  osmError,
  modifiedExistingCount,
  onResetAllExistingHeights,
  showSurfaceTemperature,
  onToggleSurfaceTemperature,
  basemapStyle,
  onChangeBasemapStyle,
  showTerrain3D,
  onToggleTerrain3D,
  terrainExaggeration,
  onChangeTerrainExaggeration,
  onSelectCameraPreset,
  onResetCamera,
}: ToolbarProps) {
  return (
    <aside
      aria-label="Strumenti editor urbano"
      className="pointer-events-auto absolute left-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] w-60 flex-col overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-4 text-slate-900 shadow-lg backdrop-blur-md"
    >
      {/* Intestazione applicativa */}
      <div className="pb-3">
        <h1 className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Urbano 3D
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Editor urbano · deck.gl
        </p>
      </div>

      <div className="h-px bg-slate-200/80" />

      {/* Elenco degli strumenti principali */}
      <div className="py-3">
        <p className="mb-2 text-xs font-medium text-slate-500">Strumenti</p>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Modalità strumento">
          {TOOL_DEFINITIONS.map((tool) => {
            const Icon = TOOL_ICONS[tool.id];
            const isActive = activeTool === tool.id;
            const isDestructive = tool.id === 'delete';

            return (
              <button
                key={tool.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onSelectTool(tool.id)}
                className={`group flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 ${
                  isActive
                    ? isDestructive
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? 'text-white'
                        : isDestructive
                          ? 'text-slate-500 group-hover:text-red-600'
                          : 'text-slate-500 group-hover:text-slate-900'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{tool.label}</span>
                </span>
                <span
                  className={`ml-2 shrink-0 font-mono text-[11px] tabular-nums ${
                    isActive ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  {tool.shortcut}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-slate-200/80" />

      {/* Controlli città attuale (OSM & edifici modificati) */}
      <div className="flex flex-col gap-2.5 py-3">
        <p className="text-xs font-medium text-slate-500">Città attuale</p>

        <button
          type="button"
          onClick={onLoadOsmTrees}
          disabled={isLoadingOsmTrees}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-65 whitespace-nowrap"
        >
          {isLoadingOsmTrees ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" />
              <span>Caricamento OSM…</span>
            </>
          ) : (
            <>
              <Trees className="h-3.5 w-3.5 text-emerald-700" />
              <span>Carica alberi OSM</span>
            </>
          )}
        </button>

        {osmTreesCount > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              {osmTreesCount} alberi OSM
            </span>
            <button
              type="button"
              onClick={onToggleShowOsmTrees}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              {showOsmTrees ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span>Visibili</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>Nascosti</span>
                </>
              )}
            </button>
          </div>
        )}

        {osmError && (
          <p role="alert" className="text-xs leading-snug text-red-700">
            {osmError}
          </p>
        )}

        {modifiedExistingCount > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <span className="font-mono text-slate-600 tabular-nums">
              {modifiedExistingCount}{' '}
              {modifiedExistingCount === 1 ? 'altezza modificata' : 'altezze modificate'}
            </span>
            <button
              type="button"
              onClick={onResetAllExistingHeights}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Ripristina</span>
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-slate-200/80" />

      {/* Mappa base 2D e rilievi 3D del terreno */}
      <div className="flex flex-col gap-2.5 py-3">
        <p className="text-xs font-medium text-slate-500">Mappa e terreno</p>

        {/* Selettore stile basemap 2D */}
        <div
          role="group"
          aria-label="Stile mappa base 2D"
          className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
        >
          {BASEMAP_STYLE_OPTIONS.map((option) => {
            const isSelected = basemapStyle === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChangeBasemapStyle(option.id)}
                className={`rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Toggle rilievi 3D del terreno (AWS Terrarium DEM) */}
        <button
          type="button"
          aria-pressed={showTerrain3D}
          onClick={onToggleTerrain3D}
          className={`flex min-h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap ${
            showTerrain3D
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <span className="flex items-center gap-2">
            <Mountain
              className={`h-3.5 w-3.5 shrink-0 ${
                showTerrain3D ? 'text-emerald-700' : 'text-slate-500'
              }`}
            />
            <span>Rilievi 3D terreno</span>
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            {showTerrain3D ? 'ON' : 'OFF'}
          </span>
        </button>

        {showTerrain3D && (
          <div className="flex flex-col gap-1 px-0.5">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <label htmlFor="terrain-exaggeration-slider">Scala rilievi</label>
              <span className="font-mono font-medium text-slate-800 tabular-nums">
                {terrainExaggeration.toFixed(1)}×
              </span>
            </div>
            <input
              id="terrain-exaggeration-slider"
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={terrainExaggeration}
              onChange={(e) => onChangeTerrainExaggeration(parseFloat(e.target.value))}
              className="studio-slider w-full"
            />
          </div>
        )}
      </div>

      <div className="h-px bg-slate-200/80" />

      {/* Layer tematico: Temperatura al suolo */}
      <div className="flex flex-col gap-2 py-3">
        <p className="text-xs font-medium text-slate-500">Layer tematici</p>

        <button
          type="button"
          aria-pressed={showSurfaceTemperature}
          onClick={onToggleSurfaceTemperature}
          className={`flex min-h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap ${
            showSurfaceTemperature
              ? 'border-orange-300 bg-orange-50 text-orange-950'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <span className="flex items-center gap-2">
            <Thermometer
              className={`h-3.5 w-3.5 shrink-0 ${
                showSurfaceTemperature ? 'text-orange-600' : 'text-slate-500'
              }`}
            />
            <span>Temperatura al suolo</span>
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            {showSurfaceTemperature ? 'ON' : 'OFF'}
          </span>
        </button>

        {showSurfaceTemperature && (
          <div className="flex flex-col gap-1 px-0.5 pb-1">
            <div
              className="h-2 w-full rounded-sm"
              style={{
                background:
                  'linear-gradient(90deg, #2563eb 0%, #0ea5e9 25%, #84cc16 45%, #facc15 65%, #f97316 82%, #dc2626 100%)',
              }}
            />
            <div className="flex justify-between font-mono text-[10px] text-slate-500 tabular-nums">
              <span>{TEMP_MIN_C} °C</span>
              <span>33 °C</span>
              <span>{TEMP_MAX_C} °C</span>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-slate-200/80" />

      {/* Viste rapide e ripristino camera */}
      <div className="flex flex-col gap-2 pt-3">
        <div className="grid grid-cols-3 gap-1">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectCameraPreset(preset)}
              className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 truncate"
              title={`Vai a ${preset.label}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onResetCamera}
          className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Reimposta vista 3D</span>
        </button>
      </div>
    </aside>
  );
}
