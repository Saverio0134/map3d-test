import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewState } from 'deck.gl';
import type { EditAction, SimpleFeatureCollection } from '@deck.gl-community/editable-layers';
import {
  EMPTY_SCENARIO,
  INITIAL_VIEW_STATE,
  isBuildingFeature,
  isTreeFeature,
  type BasemapStyleId,
  type BuildingCreationDefaults,
  type BuildingProperties,
  type CameraPreset,
  type OsmTreeRecord,
  type ScenarioCollection,
  type ScenarioFeature,
  type SelectedExistingBuilding,
  type ToolMode,
  type TreeCreationDefaults,
  type TreeProperties,
} from './types/scenario';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { UrbanMapEditor } from './components/UrbanMapEditor';
import { getToolDefinition } from './tools/toolDefinitions';
import { selectFeatureInViewMode } from './tools/viewTool';
import { applyAddBuildingEdit } from './tools/addBuildingTool';
import { applyAddTreeEdit } from './tools/addTreeTool';
import { applyTransformEdit } from './tools/transformTool';
import { deleteScenarioFeature } from './tools/deleteTool';
import {
  resetAllExistingBuildingHeights,
  resetExistingBuildingHeight,
  setExistingBuildingHeight,
} from './tools/editExistingBuildingTool';
import { fetchOsmTreesInBounds, type BoundingBox } from './utils/overpass';
import { exportScenarioToGeoJson, parseScenarioGeoJson } from './utils/geojsonIO';

/**
 * Componente radice dell'editor urbano 3D.
 * Mantiene l'unico stato di verità dello scenario GeoJSON (`scenario`),
 * lo strumento attivo, la selezione (elemento aggiunto o edificio esistente)
 * e gli alberi OSM caricati dalla città attuale.
 */
export default function App() {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [activeTool, setActiveTool] = useState<ToolMode>('view');
  const [scenario, setScenario] = useState<ScenarioCollection>(EMPTY_SCENARIO);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedExistingBuilding, setSelectedExistingBuilding] =
    useState<SelectedExistingBuilding | null>(null);

  // Parametri di default per i nuovi elementi creati dall'utente
  const [buildingDefaults, setBuildingDefaults] = useState<BuildingCreationDefaults>({
    height: 15,
    color: '#D97757',
  });
  const [treeDefaults, setTreeDefaults] = useState<TreeCreationDefaults>({
    species: 'oak',
    minHeight: 6,
    maxHeight: 12,
    crownRadius: 4.0,
  });

  // Stato alberi esistenti caricati da Overpass API (OpenStreetMap)
  const [osmTrees, setOsmTrees] = useState<OsmTreeRecord[]>([]);
  const [showOsmTrees, setShowOsmTrees] = useState<boolean>(true);
  const [isLoadingOsmTrees, setIsLoadingOsmTrees] = useState<boolean>(false);
  const [osmError, setOsmError] = useState<string | null>(null);

  // Stato visibilità del layer tematico Temperatura al suolo
  const [showSurfaceTemperature, setShowSurfaceTemperature] = useState<boolean>(false);

  // Stato basemap 2D (OpenFreeMap) e rilievi 3D del terreno (AWS Terrarium DEM)
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyleId>('bright');
  const [showTerrain3D, setShowTerrain3D] = useState<boolean>(true);
  const [terrainExaggeration, setTerrainExaggeration] = useState<number>(1.5);

  // Feedback discreto per esportazione / importazione GeoJSON
  const [ioFeedback, setIoFeedback] = useState<{
    kind: 'info' | 'error';
    message: string;
  } | null>(null);

  const getBoundsRef = useRef<() => BoundingBox | null>(() => null);
  const overpassAbortRef = useRef<AbortController | null>(null);

  const selectedFeature = useMemo<ScenarioFeature | null>(
    () => scenario.features.find((f) => f.properties.id === selectedFeatureId) ?? null,
    [scenario.features, selectedFeatureId]
  );

  // Scorciatoie da tastiera 1-5 per cambiare rapidamente strumento e Esc per tornare in Vista
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      const keyMap: Record<string, ToolMode> = {
        '1': 'view',
        '2': 'add-building',
        '3': 'add-tree',
        '4': 'transform',
        '5': 'delete',
      };

      if (event.key in keyMap) {
        setActiveTool(keyMap[event.key]);
        if (keyMap[event.key] !== 'view') {
          setSelectedExistingBuilding(null);
        }
      } else if (event.key === 'Escape') {
        setActiveTool('view');
        setSelectedFeatureId(null);
        setSelectedExistingBuilding(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cambio strumento dalla barra laterale
  const handleSelectTool = useCallback((tool: ToolMode) => {
    setActiveTool(tool);
    if (tool !== 'view') {
      setSelectedExistingBuilding(null);
    }
    if (tool === 'add-building' || tool === 'add-tree') {
      // Mostra i controlli di creazione nel pannello proprietà
      setSelectedFeatureId(null);
    }
  }, []);

  // Gestione centralizzata degli eventi `onEdit` provenienti da EditableGeoJsonLayer
  const handleScenarioEdit = useCallback(
    (action: EditAction<SimpleFeatureCollection>) => {
      if (activeTool === 'add-building') {
        const result = applyAddBuildingEdit(scenario, action, buildingDefaults);
        if (result) {
          setScenario(result.scenario);
          setSelectedExistingBuilding(null);
          setSelectedFeatureId(result.createdFeatureId);
        }
        return;
      }

      if (activeTool === 'add-tree') {
        const result = applyAddTreeEdit(scenario, action, treeDefaults);
        if (result) {
          setScenario(result.scenario);
          setSelectedExistingBuilding(null);
          setSelectedFeatureId(result.createdFeatureId);
        }
        return;
      }

      if (activeTool === 'transform') {
        const nextScenario = applyTransformEdit(scenario, action);
        if (nextScenario) {
          setScenario(nextScenario);
        }
      }
    },
    [activeTool, scenario, buildingDefaults, treeDefaults]
  );

  // Clic su un edificio o albero 3D aggiunto dall'utente
  const handleUserFeatureClick = useCallback(
    (feature: ScenarioFeature) => {
      if (activeTool === 'delete') {
        setScenario((prev) => deleteScenarioFeature(prev, feature.properties.id));
        setSelectedFeatureId((prev) => (prev === feature.properties.id ? null : prev));
        return;
      }

      if (activeTool === 'view' || activeTool === 'transform') {
        const selectedId = selectFeatureInViewMode(scenario, feature);
        setSelectedExistingBuilding(null);
        setSelectedFeatureId(selectedId);
      }
    },
    [activeTool, scenario]
  );

  // Selezione tramite indice dalla sagoma 2D di EditableGeoJsonLayer in modalità Sposta/Ruota
  const handleSelectFeatureIndex = useCallback(
    (index: number) => {
      const target = scenario.features[index];
      if (target) {
        setSelectedExistingBuilding(null);
        setSelectedFeatureId(target.properties.id);
      }
    },
    [scenario.features]
  );

  // Selezione di un edificio esistente della città per modificarne l'altezza
  const handleSelectExistingBuilding = useCallback((building: SelectedExistingBuilding) => {
    setSelectedFeatureId(null);
    setSelectedExistingBuilding(building);
  }, []);

  // Selezione elemento utente dal pannello destro
  const handleSelectFeatureFromPanel = useCallback((id: string | null) => {
    setSelectedExistingBuilding(null);
    setSelectedFeatureId(id);
  }, []);

  // Deselezione completa
  const handleClearSelection = useCallback(() => {
    setSelectedFeatureId(null);
    setSelectedExistingBuilding(null);
  }, []);

  // Aggiornamento proprietà edificio aggiunto (altezza 3-150 m, colore)
  const handleUpdateBuilding = useCallback(
    (id: string, patch: Partial<Pick<BuildingProperties, 'height' | 'color'>>) => {
      setScenario((prev) => ({
        ...prev,
        features: prev.features.map((feature): ScenarioFeature => {
          if (!isBuildingFeature(feature) || feature.properties.id !== id) {
            return feature;
          }
          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...patch,
            },
          };
        }),
      }));
    },
    []
  );

  // Aggiornamento proprietà albero aggiunto (specie, altezza, raggio chioma)
  const handleUpdateTree = useCallback(
    (
      id: string,
      patch: Partial<Pick<TreeProperties, 'species' | 'height' | 'crownRadius'>>
    ) => {
      setScenario((prev) => ({
        ...prev,
        features: prev.features.map((feature): ScenarioFeature => {
          if (!isTreeFeature(feature) || feature.properties.id !== id) {
            return feature;
          }
          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...patch,
            },
          };
        }),
      }));

      // Mantiene allineati i parametri per i clic successivi in modalità "Aggiungi albero"
      if (patch.species !== undefined || patch.crownRadius !== undefined) {
        setTreeDefaults((prev) => ({
          ...prev,
          ...(patch.species !== undefined ? { species: patch.species } : {}),
          ...(patch.crownRadius !== undefined ? { crownRadius: patch.crownRadius } : {}),
        }));
      }
    },
    []
  );

  // Aggiornamento altezza di un edificio esistente della città
  const handleUpdateExistingBuildingHeight = useCallback((id: string, height: number) => {
    setScenario((prev) => setExistingBuildingHeight(prev, id, height));
  }, []);

  // Ripristino altezza originale di un singolo edificio esistente
  const handleResetExistingBuildingHeight = useCallback((id: string) => {
    setScenario((prev) => resetExistingBuildingHeight(prev, id));
  }, []);

  // Ripristino altezze originali di tutti gli edifici esistenti modificati
  const handleResetAllExistingHeights = useCallback(() => {
    setScenario((prev) => resetAllExistingBuildingHeights(prev));
  }, []);

  // Eliminazione elemento utente dal pannello proprietà
  const handleDeleteSelected = useCallback((id: string) => {
    setScenario((prev) => deleteScenarioFeature(prev, id));
    setSelectedFeatureId((prev) => (prev === id ? null : prev));
  }, []);

  // Carica gli alberi esistenti OSM nel riquadro visibile tramite Overpass API
  const handleLoadOsmTrees = useCallback(async () => {
    const bounds = getBoundsRef.current();
    if (!bounds) return;

    overpassAbortRef.current?.abort();
    const controller = new AbortController();
    overpassAbortRef.current = controller;

    setIsLoadingOsmTrees(true);
    setOsmError(null);

    try {
      const trees = await fetchOsmTreesInBounds(bounds, controller.signal);
      setOsmTrees(trees);
      setShowOsmTrees(true);
      if (trees.length === 0) {
        setOsmError('Nessun albero mappato in OSM in questa inquadratura.');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setOsmError(
        err instanceof Error
          ? err.message
          : 'Errore nel caricamento degli alberi da Overpass API.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingOsmTrees(false);
      }
    }
  }, []);

  // Esporta l'intero scenario in formato GeoJSON
  const handleExportGeoJson = useCallback(() => {
    const modifiedCount = Object.keys(scenario.existingBuildingHeights).length;
    exportScenarioToGeoJson(scenario);
    setIoFeedback({
      kind: 'info',
      message: `Esportati ${scenario.features.length} elementi e ${modifiedCount} altezze modificate.`,
    });
  }, [scenario]);

  // Importa uno scenario GeoJSON precedentemente salvato
  const handleImportGeoJsonFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const imported = parseScenarioGeoJson(text);
        const modifiedCount = Object.keys(imported.existingBuildingHeights).length;
        setScenario(imported);
        setSelectedFeatureId(null);
        setSelectedExistingBuilding(null);
        setIoFeedback({
          kind: 'info',
          message: `Importati ${imported.features.length} elementi e ${modifiedCount} altezze modificate.`,
        });
      } catch (err) {
        setIoFeedback({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Impossibile leggere il file GeoJSON.',
        });
      }
    };
    reader.onerror = () => {
      setIoFeedback({
        kind: 'error',
        message: 'Errore di lettura del file selezionato.',
      });
    };
    reader.readAsText(file);
  }, []);

  const handleToggleTerrain3D = useCallback(() => {
    setShowTerrain3D((prev) => {
      const next = !prev;
      if (!next) {
        // Riporta la quota camera a Z = 0 quando si disattiva il rilievo 3D
        setViewState((vs) => ({ ...vs, position: [0, 0, 0] }));
      }
      return next;
    });
  }, []);

  const handleSelectCameraPreset = useCallback((preset: CameraPreset) => {
    setViewState({
      ...INITIAL_VIEW_STATE,
      longitude: preset.longitude,
      latitude: preset.latitude,
      zoom: preset.zoom,
      pitch: preset.pitch,
      bearing: preset.bearing,
      position: [0, 0, 0],
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    setViewState({ ...INITIAL_VIEW_STATE, position: [0, 0, 0] });
  }, []);

  const activeToolDef = getToolDefinition(activeTool);
  const modifiedExistingCount = Object.keys(scenario.existingBuildingHeights).length;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-200 select-none">
      {/* Scena 3D principale DeckGL + MapLibre */}
      <UrbanMapEditor
        viewState={viewState}
        onViewStateChange={setViewState}
        activeTool={activeTool}
        scenario={scenario}
        selectedFeatureId={selectedFeatureId}
        selectedExistingBuildingId={selectedExistingBuilding?.id ?? null}
        osmTrees={osmTrees}
        showOsmTrees={showOsmTrees}
        showSurfaceTemperature={showSurfaceTemperature}
        basemapStyle={basemapStyle}
        showTerrain3D={showTerrain3D}
        terrainExaggeration={terrainExaggeration}
        onScenarioEdit={handleScenarioEdit}
        onUserFeatureClick={handleUserFeatureClick}
        onSelectFeatureIndex={handleSelectFeatureIndex}
        onSelectExistingBuilding={handleSelectExistingBuilding}
        onClearSelection={handleClearSelection}
        onViewportBoundsRef={(getter) => {
          getBoundsRef.current = getter;
        }}
      />

      {/* Barra laterale sinistra: strumenti + città attuale + mappa/terreno + temperatura al suolo */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        onLoadOsmTrees={handleLoadOsmTrees}
        isLoadingOsmTrees={isLoadingOsmTrees}
        osmTreesCount={osmTrees.length}
        showOsmTrees={showOsmTrees}
        onToggleShowOsmTrees={() => setShowOsmTrees((prev) => !prev)}
        osmError={osmError}
        modifiedExistingCount={modifiedExistingCount}
        onResetAllExistingHeights={handleResetAllExistingHeights}
        showSurfaceTemperature={showSurfaceTemperature}
        onToggleSurfaceTemperature={() => setShowSurfaceTemperature((prev) => !prev)}
        basemapStyle={basemapStyle}
        onChangeBasemapStyle={setBasemapStyle}
        showTerrain3D={showTerrain3D}
        onToggleTerrain3D={handleToggleTerrain3D}
        terrainExaggeration={terrainExaggeration}
        onChangeTerrainExaggeration={setTerrainExaggeration}
        onSelectCameraPreset={handleSelectCameraPreset}
        onResetCamera={handleResetCamera}
      />

      {/* Pannello destro: proprietà elemento / edificio esistente + import/export GeoJSON */}
      <PropertiesPanel
        activeTool={activeTool}
        scenario={scenario}
        selectedFeature={selectedFeature}
        selectedExistingBuilding={selectedExistingBuilding}
        buildingDefaults={buildingDefaults}
        onChangeBuildingDefaults={setBuildingDefaults}
        treeDefaults={treeDefaults}
        onChangeTreeDefaults={setTreeDefaults}
        onUpdateBuilding={handleUpdateBuilding}
        onUpdateTree={handleUpdateTree}
        onUpdateExistingBuildingHeight={handleUpdateExistingBuildingHeight}
        onResetExistingBuildingHeight={handleResetExistingBuildingHeight}
        onClearExistingBuildingSelection={() => setSelectedExistingBuilding(null)}
        onSelectFeature={handleSelectFeatureFromPanel}
        onActivateTransformForSelected={() => setActiveTool('transform')}
        onDeleteSelected={handleDeleteSelected}
        onExportGeoJson={handleExportGeoJson}
        onImportGeoJsonFile={handleImportGeoJsonFile}
        ioFeedback={ioFeedback}
      />

      {/* Barra guida contestuale discreta in basso */}
      <div
        aria-live="polite"
        className="pointer-events-none absolute bottom-4 left-1/2 z-10 max-w-xl -translate-x-1/2 rounded-lg border border-white/10 bg-slate-900/85 px-4 py-2 text-center text-xs text-slate-100 shadow-md backdrop-blur-md"
      >
        <span className="font-semibold text-white">{activeToolDef.label}</span>
        <span className="mx-2 text-slate-400" aria-hidden="true">
          ·
        </span>
        <span className="text-slate-200">{activeToolDef.hint}</span>
      </div>
    </main>
  );
}
