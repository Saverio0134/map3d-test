import { PolygonLayer } from 'deck.gl';
import type { BuildingFeature, ToolMode } from '../types/scenario';
import { hexToRgba } from '../utils/geometry';
import { SHARED_TERRAIN_EXTENSION } from './basemapTerrainLayer';

interface UserBuildingsLayerOptions {
  /** Edifici aggiunti dall'utente estratti dallo scenario GeoJSON. */
  buildings: BuildingFeature[];
  /** ID dell'edificio attualmente selezionato nel pannello proprietà. */
  selectedFeatureId: string | null;
  /** Strumento attivo nell'editor. */
  activeTool: ToolMode;
  /** Se true, aggancia la base di ogni palazzo alla superficie del terreno 3D. */
  showTerrain3D: boolean;
  /** Callback chiamata al clic su un edificio utente. */
  onBuildingClick?: (feature: BuildingFeature) => void;
}

/**
 * Layer 3D dei palazzi aggiunti dall'utente.
 * Legge esclusivamente dai dati Polygon dello scenario GeoJSON e li estrude
 * con `PolygonLayer` (`extruded: true`).
 */
export function createUserBuildingsLayer({
  buildings,
  selectedFeatureId,
  activeTool,
  showTerrain3D,
  onBuildingClick,
}: UserBuildingsLayerOptions): PolygonLayer<BuildingFeature> {
  const isDeleteMode = activeTool === 'delete';

  return new PolygonLayer<BuildingFeature>({
    id: 'user-scenario-buildings-3d',
    data: buildings,
    extruded: true,
    wireframe: false,
    filled: true,
    stroked: true,
    pickable: true,
    extensions: showTerrain3D ? [SHARED_TERRAIN_EXTENSION] : [],
    ...(showTerrain3D ? { terrainDrawMode: 'offset' as const } : {}),
    autoHighlight: activeTool === 'view' || activeTool === 'delete' || activeTool === 'transform',
    highlightColor: isDeleteMode ? [220, 38, 38, 175] : [37, 99, 235, 95],
    material: {
      ambient: 0.5,
      diffuse: 0.7,
      shininess: 16,
      specularColor: [35, 35, 35],
    },
    getPolygon: (feature) => feature.geometry.coordinates,
    getElevation: (feature) => feature.properties.height,
    getFillColor: (feature) => hexToRgba(feature.properties.color, 255),
    getLineColor: (feature) =>
      feature.properties.id === selectedFeatureId
        ? [30, 64, 175, 255]
        : [15, 23, 42, 48],
    getLineWidth: (feature) =>
      feature.properties.id === selectedFeatureId ? 1.8 : 0.6,
    lineWidthMinPixels: 1,
    updateTriggers: {
      getPolygon: [buildings],
      getElevation: [buildings],
      getFillColor: [buildings],
      getLineColor: [buildings, selectedFeatureId],
      getLineWidth: [buildings, selectedFeatureId],
    },
    onClick: (info) => {
      if (!info.object || !onBuildingClick) return false;
      onBuildingClick(info.object as BuildingFeature);
      return true;
    },
  });
}
