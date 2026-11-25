import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DeckGL,
  MapController,
  WebMercatorViewport,
  type LayersList,
  type MapViewState,
  type PickingInfo,
} from 'deck.gl';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Map as MapLibreMap } from 'react-map-gl/maplibre';

// In Vite dev/build maplibre-gl v6 risolve il worker relativo al bundle (.vite/deps -> 404):
// impostare esplicitamente l'URL emesso da Vite (?url) garantisce il caricamento della basemap MapLibre.
maplibregl.setWorkerUrl(maplibreWorkerUrl);
import type {
  EditAction,
  GeoJsonEditModeType,
  SimpleFeatureCollection,
} from '@deck.gl-community/editable-layers';
import type {
  BasemapStyleId,
  BuildingFeature,
  OsmTreeRecord,
  ScenarioCollection,
  ScenarioFeature,
  SelectedExistingBuilding,
  ToolMode,
  TreeFeature,
} from '../types/scenario';
import { createUrbanLightingEffect } from '../layers/lighting';
import {
  MAPLIBRE_STYLE_URLS,
  createBasemapTerrainLayers,
} from '../layers/basemapTerrainLayer';
import { createExistingBuildingsLayer } from '../layers/existingBuildingsLayer';
import { createOsmTreesLayer } from '../layers/osmTreesLayer';
import { createUserBuildingsLayer } from '../layers/userBuildingsLayer';
import { createUserTreesLayer } from '../layers/userTreesLayer';
import { createEditableScenarioLayer } from '../layers/editableScenarioLayer';
import { createSurfaceTemperatureLayer } from '../layers/surfaceTemperatureLayer';
import { createAddBuildingMode } from '../tools/addBuildingTool';
import { createAddTreeMode } from '../tools/addTreeTool';
import { createTransformMode } from '../tools/transformTool';
import type { BoundingBox } from '../utils/overpass';
import {
  getCachedTerrainElevation,
  prefetchTerrainElevations,
} from '../utils/terrainElevation';

interface UrbanMapEditorProps {
  viewState: MapViewState;
  onViewStateChange: (nextViewState: MapViewState) => void;
  activeTool: ToolMode;
  scenario: ScenarioCollection;
  selectedFeatureId: string | null;
  selectedExistingBuildingId: string | null;
  osmTrees: OsmTreeRecord[];
  showOsmTrees: boolean;
  showSurfaceTemperature: boolean;
  basemapStyle: BasemapStyleId;
  showTerrain3D: boolean;
  terrainExaggeration: number;
  onScenarioEdit: (action: EditAction<SimpleFeatureCollection>) => void;
  onUserFeatureClick: (feature: ScenarioFeature) => void;
  onSelectFeatureIndex: (index: number) => void;
  onSelectExistingBuilding: (building: SelectedExistingBuilding) => void;
  onClearSelection: () => void;
  onViewportBoundsRef: (getter: () => BoundingBox | null) => void;
}

/**
 * Componente principale della scena 3D:
 * - Usa `DeckGL` come contenitore principale con il proprio controller (non interleaved)
 *   e `Map` di `react-map-gl/maplibre` come figlio, così il trascinamento delle maniglie
 *   di `EditableGeoJsonLayer` non trascina la mappa sottostante.
 * - Compone la basemap 2D / rilievi 3D del terreno (`TerrainLayer` AWS Terrarium),
 *   i layer 3D (edifici OpenFreeMap modificabili in altezza, alberi OSM, palazzi utente,
 *   alberi utente), il layer termico al suolo e monta `EditableGeoJsonLayer`
 *   solo durante le modalità di modifica.
 */
export function UrbanMapEditor({
  viewState,
  onViewStateChange,
  activeTool,
  scenario,
  selectedFeatureId,
  selectedExistingBuildingId,
  osmTrees,
  showOsmTrees,
  showSurfaceTemperature,
  basemapStyle,
  showTerrain3D,
  terrainExaggeration,
  onScenarioEdit,
  onUserFeatureClick,
  onSelectFeatureIndex,
  onSelectExistingBuilding,
  onClearSelection,
  onViewportBoundsRef,
}: UrbanMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  const [terrainTileVersion, setTerrainTileVersion] = useState(0);

  // Centro quantizzato (~180 m) per la griglia termica: evita ricalcoli continui durante pan/orbita
  const [tempAnchorCenter, setTempAnchorCenter] = useState<[number, number]>([
    viewState.longitude,
    viewState.latitude,
  ]);

  useEffect(() => {
    const dLon = Math.abs(viewState.longitude - tempAnchorCenter[0]);
    const dLat = Math.abs(viewState.latitude - tempAnchorCenter[1]);
    if (dLon > 0.0022 || dLat > 0.0016) {
      setTempAnchorCenter([viewState.longitude, viewState.latitude]);
    }
  }, [viewState.longitude, viewState.latitude, tempAnchorCenter]);

  // Effetto di illuminazione stabile (ambientale + sole direzionale)
  const lightingEffect = useMemo(() => createUrbanLightingEffect(), []);

  // Istanze stabili delle modalità di editing per non perdere lo stato di disegno tra i render
  const editMode = useMemo<GeoJsonEditModeType | null>(() => {
    switch (activeTool) {
      case 'add-building':
        return createAddBuildingMode();
      case 'add-tree':
        return createAddTreeMode();
      case 'transform':
        return createTransformMode();
      default:
        return null;
    }
  }, [activeTool]);

  // Separa i dati dello scenario in edifici (Polygon) e alberi (Point) per i rispettivi layer 3D
  const userBuildings = useMemo<BuildingFeature[]>(
    () =>
      scenario.features.filter(
        (feature): feature is BuildingFeature => feature.properties.kind === 'building'
      ),
    [scenario.features]
  );

  const userTrees = useMemo<TreeFeature[]>(
    () =>
      scenario.features.filter(
        (feature): feature is TreeFeature => feature.properties.kind === 'tree'
      ),
    [scenario.features]
  );

  // Precarica in background le tile altimetriche Terrarium per appoggiare gli alberi 3D al terreno
  useEffect(() => {
    if (!showTerrain3D) return;
    let cancelled = false;
    const coords: [number, number][] = [
      tempAnchorCenter,
      ...userTrees.map(
        (t) => [t.geometry.coordinates[0], t.geometry.coordinates[1]] as [number, number]
      ),
      ...osmTrees.map((t) => t.position),
    ];

    void prefetchTerrainElevations(coords).then((updated) => {
      if (!cancelled && updated) {
        setTerrainTileVersion((prev) => prev + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showTerrain3D, tempAnchorCenter, userTrees, osmTrees]);

  // Campionatore sincrono della quota altimetrica per gli alberi 3D (0 m in modalità piana 2D)
  const getGroundElevation = useCallback(
    (lon: number, lat: number) =>
      showTerrain3D ? getCachedTerrainElevation(lon, lat, terrainExaggeration) : 0,
    [showTerrain3D, terrainExaggeration]
  );

  // Revisione deterministica per forzare l'aggiornamento Z di TreeLayer quando cambia il terreno
  const terrainRevision = showTerrain3D
    ? terrainTileVersion * 1000 + Math.round(terrainExaggeration * 100)
    : 0;

  // Indice selezionato per TransformMode
  const selectedFeatureIndexes = useMemo<number[]>(() => {
    if (!selectedFeatureId) return [];
    const idx = scenario.features.findIndex((f) => f.properties.id === selectedFeatureId);
    return idx >= 0 ? [idx] : [];
  }, [scenario.features, selectedFeatureId]);

  // Espone una funzione che calcola il riquadro geografico visibile corrente per Overpass API
  useEffect(() => {
    onViewportBoundsRef(() => {
      const container = containerRef.current;
      if (!container) return null;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      const viewport = new WebMercatorViewport({
        ...viewState,
        width,
        height,
      });
      const [west, south, east, north] = viewport.getBounds();
      return {
        south,
        west,
        north,
        east,
        centerLat: viewState.latitude,
        centerLon: viewState.longitude,
      };
    });
  }, [viewState, onViewportBoundsRef]);

  // Costruzione della pila dei layer:
  // 0) Basemap 2D / Terreno 3D con rilievi (TerrainLayer o TileLayer+BitmapLayer)
  // 1) Layer tematico temperatura al suolo (drappeggiato sul terreno 3D)
  // 2) Layer 3D città attuale + scenario utente (appoggiati sulla quota del terreno)
  // 3) Layer di editing 2D (montato solo durante disegno/trasformazione)
  const layers = useMemo<LayersList>(() => {
    const basemapTerrainLayers = createBasemapTerrainLayers({
      basemapStyle,
      showTerrain3D,
      terrainExaggeration,
    });

    const surfaceTemperatureLayer = createSurfaceTemperatureLayer({
      visible: showSurfaceTemperature,
      anchorCenter: tempAnchorCenter,
      userBuildings,
      userTrees,
      osmTrees,
      showTerrain3D,
    });

    const existingBuildingsLayer = createExistingBuildingsLayer({
      existingBuildingHeights: scenario.existingBuildingHeights,
      selectedBuildingId: selectedExistingBuildingId,
      activeTool,
      showTerrain3D,
      onSelectBuilding: onSelectExistingBuilding,
    });

    const osmTreesLayer = createOsmTreesLayer({
      trees: osmTrees,
      visible: showOsmTrees,
      getGroundElevation,
      terrainRevision,
    });

    const userBuildingsLayer = createUserBuildingsLayer({
      buildings: userBuildings,
      selectedFeatureId,
      activeTool,
      showTerrain3D,
      onBuildingClick: onUserFeatureClick,
    });

    const userTreesLayer = createUserTreesLayer({
      trees: userTrees,
      selectedFeatureId,
      activeTool,
      getGroundElevation,
      terrainRevision,
      onTreeClick: onUserFeatureClick,
    });

    const editableLayer = createEditableScenarioLayer({
      scenario,
      activeTool,
      editMode,
      selectedFeatureIndexes,
      showTerrain3D,
      onEdit: onScenarioEdit,
      onSelectFeatureIndex,
    });

    return [
      ...basemapTerrainLayers,
      surfaceTemperatureLayer,
      existingBuildingsLayer,
      osmTreesLayer,
      userBuildingsLayer,
      userTreesLayer,
      editableLayer,
    ].filter(Boolean);
  }, [
    basemapStyle,
    showTerrain3D,
    terrainExaggeration,
    showSurfaceTemperature,
    tempAnchorCenter,
    scenario,
    selectedExistingBuildingId,
    activeTool,
    osmTrees,
    showOsmTrees,
    getGroundElevation,
    terrainRevision,
    userBuildings,
    userTrees,
    selectedFeatureId,
    editMode,
    selectedFeatureIndexes,
    onSelectExistingBuilding,
    onUserFeatureClick,
    onScenarioEdit,
    onSelectFeatureIndex,
  ]);

  // Deseleziona se si clicca a vuoto sulla mappa in Vista o Sposta/Ruota
  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object && (activeTool === 'view' || activeTool === 'transform')) {
        onClearSelection();
      }
    },
    [activeTool, onClearSelection]
  );

  // Gestione del cursore contestuale in base allo strumento attivo
  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) => {
      if (activeTool === 'add-building' || activeTool === 'add-tree') {
        return 'crosshair';
      }
      if (activeTool === 'delete') {
        return isHovering ? 'pointer' : 'crosshair';
      }
      if (isDragging) return 'grabbing';
      if (isHovering) return 'pointer';
      return 'grab';
    },
    [activeTool]
  );

  // Sicurezza per perdita/ripristino del contesto WebGL
  const handleWebGLInitialized = useCallback((gl: WebGL2RenderingContext | WebGLRenderingContext) => {
    const canvas = gl?.canvas;
    if (!canvas) return;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      setWebglLost(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      setWebglLost(false);
    });
  }, []);

  // Controller MapController stabile e memoizzato: evita il bug di deck.gl 9.4 sul cambio dinamico
  // di tipo controller (TerrainController -> MapController non finalizza il precedente) e garantisce
  // pan, zoom, rotazione e inclinazione fluidi sia in 2D che con i rilievi 3D attivi.
  const controllerConfig = useMemo(
    () => ({
      type: MapController,
      scrollZoom: true,
      dragPan: true,
      dragRotate: true,
      touchZoom: true,
      touchRotate: true,
      // Disattiva lo zoom su doppio clic durante il disegno per completare i poligoni senza zoomare
      doubleClickZoom: activeTool === 'view',
    }),
    [activeTool]
  );

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-200">
      <DeckGL
        viewState={viewState}
        onViewStateChange={(params) => {
          onViewStateChange(params.viewState as MapViewState);
        }}
        controller={controllerConfig}
        layers={layers}
        effects={[lightingEffect]}
        onClick={handleDeckClick}
        getCursor={getCursor}
        onWebGLInitialized={handleWebGLInitialized}
      >
        <MapLibreMap
          mapLib={maplibregl}
          reuseMaps
          interactive={false}
          mapStyle={MAPLIBRE_STYLE_URLS[basemapStyle]}
          attributionControl={{ compact: true }}
        />
      </DeckGL>

      {webglLost && (
        <div
          role="alert"
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-100/90 backdrop-blur-sm"
        >
          <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-center shadow-lg">
            <h2 className="text-sm font-semibold text-slate-900">
              Contesto WebGL temporaneamente sospeso
            </h2>
            <p className="mt-1.5 text-xs text-slate-600">
              Il rendering 3D è stato interrotto dal browser. Ricarica la pagina se la vista non si ripristina automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

