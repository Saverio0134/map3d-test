import { useRef, type ChangeEvent } from 'react';
import {
  Building2,
  Download,
  Move,
  RotateCcw,
  Trash2,
  TreePine,
  Upload,
  X,
} from 'lucide-react';
import {
  BUILDING_COLOR_PRESETS,
  isBuildingFeature,
  isTreeFeature,
  TREE_SPECIES_OPTIONS,
  type BuildingCreationDefaults,
  type BuildingProperties,
  type ScenarioCollection,
  type ScenarioFeature,
  type SelectedExistingBuilding,
  type ToolMode,
  type TreeCreationDefaults,
  type TreeProperties,
  type TreeSpecies,
} from '../types/scenario';
import { estimatePolygonAreaSqm } from '../utils/geometry';

interface PropertiesPanelProps {
  activeTool: ToolMode;
  scenario: ScenarioCollection;
  selectedFeature: ScenarioFeature | null;
  selectedExistingBuilding: SelectedExistingBuilding | null;
  buildingDefaults: BuildingCreationDefaults;
  onChangeBuildingDefaults: (next: BuildingCreationDefaults) => void;
  treeDefaults: TreeCreationDefaults;
  onChangeTreeDefaults: (next: TreeCreationDefaults) => void;
  onUpdateBuilding: (id: string, patch: Partial<Pick<BuildingProperties, 'height' | 'color'>>) => void;
  onUpdateTree: (
    id: string,
    patch: Partial<Pick<TreeProperties, 'species' | 'height' | 'crownRadius'>>
  ) => void;
  onUpdateExistingBuildingHeight: (id: string, height: number) => void;
  onResetExistingBuildingHeight: (id: string) => void;
  onClearExistingBuildingSelection: () => void;
  onSelectFeature: (id: string | null) => void;
  onActivateTransformForSelected: () => void;
  onDeleteSelected: (id: string) => void;
  onExportGeoJson: () => void;
  onImportGeoJsonFile: (file: File) => void;
  ioFeedback: { kind: 'info' | 'error'; message: string } | null;
}

/**
 * Pannello proprietà destro:
 * - mostra i parametri dell'edificio o dell'albero selezionato (con aggiornamento immediato in 3D);
 * - in modalità disegno permette di configurare i parametri dei nuovi elementi;
 * - espone l'elenco sintetico dello scenario e i pulsanti "Esporta GeoJSON" / "Importa GeoJSON".
 */
export function PropertiesPanel({
  activeTool,
  scenario,
  selectedFeature,
  selectedExistingBuilding,
  buildingDefaults,
  onChangeBuildingDefaults,
  treeDefaults,
  onChangeTreeDefaults,
  onUpdateBuilding,
  onUpdateTree,
  onUpdateExistingBuildingHeight,
  onResetExistingBuildingHeight,
  onClearExistingBuildingSelection,
  onSelectFeature,
  onActivateTransformForSelected,
  onDeleteSelected,
  onExportGeoJson,
  onImportGeoJsonFile,
  ioFeedback,
}: PropertiesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildingsCount = scenario.features.filter((f) => f.properties.kind === 'building').length;
  const treesCount = scenario.features.filter((f) => f.properties.kind === 'tree').length;
  const modifiedExistingCount = Object.keys(scenario.existingBuildingHeights).length;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportGeoJsonFile(file);
    }
    // Reset del campo per consentire la re-importazione dello stesso file
    event.target.value = '';
  };

  const handleSelectCreationSpecies = (species: TreeSpecies) => {
    const spec = TREE_SPECIES_OPTIONS.find((item) => item.value === species);
    onChangeTreeDefaults({
      ...treeDefaults,
      species,
      crownRadius: spec ? spec.defaultCrownRadius : treeDefaults.crownRadius,
    });
  };

  const selectedBuilding =
    selectedFeature && isBuildingFeature(selectedFeature) ? selectedFeature : null;
  const selectedTree =
    selectedFeature && isTreeFeature(selectedFeature) ? selectedFeature : null;

  const existingCurrentHeight = selectedExistingBuilding
    ? (scenario.existingBuildingHeights[selectedExistingBuilding.id] ??
        selectedExistingBuilding.originalHeight)
    : null;
  const isExistingModified = selectedExistingBuilding
    ? selectedExistingBuilding.id in scenario.existingBuildingHeights
    : false;

  return (
    <aside
      aria-label="Pannello proprietà scenario"
      className="pointer-events-auto absolute right-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] w-80 flex-col overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-4 text-slate-900 shadow-lg backdrop-blur-md"
    >
      {/* Sezione 1: Proprietà elemento selezionato OPPURE parametri di creazione */}
      {selectedExistingBuilding && existingCurrentHeight !== null ? (
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Edificio esistente
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                Originale {selectedExistingBuilding.originalHeight} m · ID{' '}
                {selectedExistingBuilding.id.slice(0, 12)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearExistingBuildingSelection}
              aria-label="Chiudi selezione"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Slider altezza edificio esistente (3–150 m) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="existing-building-height" className="font-medium text-slate-700">
                Altezza
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {existingCurrentHeight} m
              </span>
            </div>
            <input
              id="existing-building-height"
              type="range"
              min={3}
              max={150}
              step={1}
              value={existingCurrentHeight}
              onChange={(e) =>
                onUpdateExistingBuildingHeight(
                  selectedExistingBuilding.id,
                  Number(e.target.value)
                )
              }
              className="studio-slider w-full"
            />
            <div className="flex justify-between font-mono text-[11px] text-slate-400 tabular-nums">
              <span>3 m</span>
              <span>75 m</span>
              <span>150 m</span>
            </div>
          </div>

          {isExistingModified && (
            <button
              type="button"
              onClick={() => onResetExistingBuildingHeight(selectedExistingBuilding.id)}
              className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Ripristina altezza originale ({selectedExistingBuilding.originalHeight} m)</span>
            </button>
          )}
        </div>
      ) : selectedBuilding ? (
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Edificio selezionato
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                {Math.round(estimatePolygonAreaSqm(selectedBuilding.geometry))} m² ·{' '}
                {Math.round(
                  estimatePolygonAreaSqm(selectedBuilding.geometry) *
                    selectedBuilding.properties.height
                ).toLocaleString('it-IT')}{' '}
                m³
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectFeature(null)}
              aria-label="Chiudi selezione"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Slider altezza edificio (3–150 m) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="selected-building-height" className="font-medium text-slate-700">
                Altezza
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {selectedBuilding.properties.height} m
              </span>
            </div>
            <input
              id="selected-building-height"
              type="range"
              min={3}
              max={150}
              step={1}
              value={selectedBuilding.properties.height}
              onChange={(e) =>
                onUpdateBuilding(selectedBuilding.properties.id, {
                  height: Number(e.target.value),
                })
              }
              className="studio-slider w-full"
            />
            <div className="flex justify-between font-mono text-[11px] text-slate-400 tabular-nums">
              <span>3 m</span>
              <span>75 m</span>
              <span>150 m</span>
            </div>
          </div>

          {/* Selettore colore edificio */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Colore facciata</span>
              <span className="font-mono text-[11px] text-slate-500">
                {selectedBuilding.properties.color.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {BUILDING_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  selectedBuilding.properties.color.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    aria-label={`Colore ${preset.label}`}
                    onClick={() =>
                      onUpdateBuilding(selectedBuilding.properties.id, { color: preset.hex })
                    }
                    className={`h-7 w-full rounded-md border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                      isSelected ? 'border-slate-900 ring-2 ring-blue-700 ring-offset-1' : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}
            </div>
            <label className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <span>Colore personalizzato</span>
              <input
                type="color"
                aria-label="Colore personalizzato edificio"
                value={selectedBuilding.properties.color}
                onChange={(e) =>
                  onUpdateBuilding(selectedBuilding.properties.id, { color: e.target.value })
                }
                className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>

          {/* Azioni rapide sull'edificio selezionato */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onActivateTransformForSelected}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              <Move className="h-3.5 w-3.5" />
              <span>Sposta / Ruota</span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteSelected(selectedBuilding.properties.id)}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Elimina</span>
            </button>
          </div>
        </div>
      ) : selectedTree ? (
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Albero selezionato
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                {selectedTree.geometry.coordinates[1].toFixed(5)},{' '}
                {selectedTree.geometry.coordinates[0].toFixed(5)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectFeature(null)}
              aria-label="Chiudi selezione"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Specie botanica (8 specie supportate da TreeLayer) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="selected-tree-species" className="text-xs font-medium text-slate-700">
              Specie
            </label>
            <div className="grid grid-cols-2 gap-1.5" id="selected-tree-species">
              {TREE_SPECIES_OPTIONS.map((option) => {
                const isSelected = selectedTree.properties.species === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onUpdateTree(selectedTree.properties.id, { species: option.value })
                    }
                    className={`min-h-8 rounded-lg border px-2.5 py-1 text-left text-xs font-medium transition-colors truncate ${
                      isSelected
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider altezza albero */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="selected-tree-height" className="font-medium text-slate-700">
                Altezza
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {selectedTree.properties.height.toFixed(1)} m
              </span>
            </div>
            <input
              id="selected-tree-height"
              type="range"
              min={2}
              max={35}
              step={0.5}
              value={selectedTree.properties.height}
              onChange={(e) =>
                onUpdateTree(selectedTree.properties.id, {
                  height: Number(e.target.value),
                })
              }
              className="studio-slider w-full"
            />
          </div>

          {/* Slider raggio chioma */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="selected-tree-crown" className="font-medium text-slate-700">
                Raggio chioma
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {selectedTree.properties.crownRadius.toFixed(1)} m
              </span>
            </div>
            <input
              id="selected-tree-crown"
              type="range"
              min={1}
              max={12}
              step={0.2}
              value={selectedTree.properties.crownRadius}
              onChange={(e) =>
                onUpdateTree(selectedTree.properties.id, {
                  crownRadius: Number(e.target.value),
                })
              }
              className="studio-slider w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onActivateTransformForSelected}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              <Move className="h-3.5 w-3.5" />
              <span>Sposta</span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteSelected(selectedTree.properties.id)}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Elimina</span>
            </button>
          </div>
        </div>
      ) : activeTool === 'add-tree' ? (
        /* Impostazioni per lo strumento "Aggiungi albero" */
        <div className="flex flex-col gap-4 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Nuovo albero
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Parametri applicati ad ogni clic sulla mappa.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-700">Specie</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TREE_SPECIES_OPTIONS.map((option) => {
                const isSelected = treeDefaults.species === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectCreationSpecies(option.value)}
                    className={`min-h-8 rounded-lg border px-2.5 py-1 text-left text-xs font-medium transition-colors truncate ${
                      isSelected
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Altezza casuale</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {treeDefaults.minHeight}–{treeDefaults.maxHeight} m
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                <span>Min (m)</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  step={1}
                  value={treeDefaults.minHeight}
                  onChange={(e) => {
                    const val = Math.max(2, Math.min(30, Number(e.target.value) || 2));
                    onChangeTreeDefaults({
                      ...treeDefaults,
                      minHeight: val,
                      maxHeight: Math.max(val, treeDefaults.maxHeight),
                    });
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                <span>Max (m)</span>
                <input
                  type="number"
                  min={2}
                  max={35}
                  step={1}
                  value={treeDefaults.maxHeight}
                  onChange={(e) => {
                    const val = Math.max(2, Math.min(35, Number(e.target.value) || 12));
                    onChangeTreeDefaults({
                      ...treeDefaults,
                      minHeight: Math.min(treeDefaults.minHeight, val),
                      maxHeight: val,
                    });
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="default-tree-crown" className="font-medium text-slate-700">
                Raggio chioma
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {treeDefaults.crownRadius.toFixed(1)} m
              </span>
            </div>
            <input
              id="default-tree-crown"
              type="range"
              min={1}
              max={12}
              step={0.2}
              value={treeDefaults.crownRadius}
              onChange={(e) =>
                onChangeTreeDefaults({
                  ...treeDefaults,
                  crownRadius: Number(e.target.value),
                })
              }
              className="studio-slider w-full"
            />
          </div>
        </div>
      ) : activeTool === 'add-building' ? (
        /* Impostazioni per lo strumento "Aggiungi palazzo" */
        <div className="flex flex-col gap-4 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Nuovo palazzo
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Traccia il poligono sulla mappa; doppio clic per completare.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="default-building-height" className="font-medium text-slate-700">
                Altezza iniziale
              </label>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {buildingDefaults.height} m
              </span>
            </div>
            <input
              id="default-building-height"
              type="range"
              min={3}
              max={150}
              step={1}
              value={buildingDefaults.height}
              onChange={(e) =>
                onChangeBuildingDefaults({
                  ...buildingDefaults,
                  height: Number(e.target.value),
                })
              }
              className="studio-slider w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-700">Colore iniziale</span>
            <div className="grid grid-cols-8 gap-1.5">
              {BUILDING_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  buildingDefaults.color.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    aria-label={`Colore ${preset.label}`}
                    onClick={() =>
                      onChangeBuildingDefaults({ ...buildingDefaults, color: preset.hex })
                    }
                    className={`h-7 w-full rounded-md border transition-transform hover:scale-105 ${
                      isSelected ? 'border-slate-900 ring-2 ring-blue-700 ring-offset-1' : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Stato senza elemento selezionato */
        <div className="pb-4">
          <h2 className="text-sm font-semibold text-slate-900">Proprietà</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Clicca su un edificio esistente della città per modificarne l’altezza, oppure su un palazzo o albero aggiunto per modificarne i parametri.
          </p>
        </div>
      )}

      {/* Sezione 2: Elenco rapido elementi aggiunti (se presenti) */}
      {scenario.features.length > 0 && (
        <>
          <div className="h-px bg-slate-200/80" />
          <div className="py-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Elementi aggiunti</span>
              <span className="font-mono text-slate-500 tabular-nums">
                {scenario.features.length}
              </span>
            </div>
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-0.5">
              {scenario.features.map((feature, idx) => {
                const isSelected = selectedFeature?.properties.id === feature.properties.id;
                const building = isBuildingFeature(feature);
                return (
                  <button
                    key={feature.properties.id}
                    type="button"
                    onClick={() => onSelectFeature(feature.properties.id)}
                    className={`flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 py-1 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-50 font-semibold text-blue-800'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {building ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      ) : (
                        <TreePine className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                      )}
                      <span className="truncate">
                        {building
                          ? `Palazzo #${idx + 1}`
                          : `Albero (${isTreeFeature(feature) ? feature.properties.species : ''})`}
                      </span>
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                      {feature.properties.height} m
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="h-px bg-slate-200/80" />

      {/* Sezione 3: Riepilogo scenario + Esporta / Importa GeoJSON */}
      <div className="flex flex-col gap-2.5 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">Scenario GeoJSON</span>
        </div>

        <p className="font-mono text-xs text-slate-500 tabular-nums">
          {buildingsCount} palazzi · {treesCount} alberi · {modifiedExistingCount} esistenti mod.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportGeoJson}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Esporta GeoJSON</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Importa GeoJSON</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />

        {ioFeedback && (
          <p
            role={ioFeedback.kind === 'error' ? 'alert' : 'status'}
            className={`text-xs leading-snug ${
              ioFeedback.kind === 'error' ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {ioFeedback.message}
          </p>
        )}
      </div>
    </aside>
  );
}
