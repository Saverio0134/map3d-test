import {
  EditableGeoJsonLayer,
  type EditAction,
  type GeoJsonEditModeType,
  type SimpleFeatureCollection,
} from '@deck.gl-community/editable-layers';
import type { ScenarioCollection, ToolMode } from '../types/scenario';
import { SHARED_TERRAIN_EXTENSION } from './basemapTerrainLayer';

interface EditableScenarioLayerOptions {
  /** Scenario GeoJSON corrente (edifici Polygon + alberi Point). */
  scenario: ScenarioCollection;
  /** Strumento attivo nell'editor. */
  activeTool: ToolMode;
  /** Istanza stabile del modo di editing (DrawPolygonMode, DrawPointMode o TransformMode). */
  editMode: GeoJsonEditModeType | null;
  /** Indici delle feature selezionate per TransformMode. */
  selectedFeatureIndexes: number[];
  /** Se true, solleva sagome 2D e maniglie alla quota del terreno 3D. */
  showTerrain3D: boolean;
  /** Callback chiamata da EditableGeoJsonLayer a ogni azione di disegno o trasformazione. */
  onEdit: (action: EditAction<SimpleFeatureCollection>) => void;
  /** Callback chiamata quando l'utente seleziona una sagoma 2D in modalità Sposta/Ruota. */
  onSelectFeatureIndex?: (index: number) => void;
}

/**
 * Restituisce true solo quando lo strumento corrente utilizza `EditableGeoJsonLayer`.
 * Fuori dalle modalità di modifica (`view`, `delete`, `hide-building`) il layer 2D
 * non viene montato: restano visibili esclusivamente i layer 3D.
 */
export function isEditingTool(tool: ToolMode): boolean {
  return tool === 'add-building' || tool === 'add-tree' || tool === 'transform';
}

/**
 * Crea l'`EditableGeoJsonLayer` per disegno 2D (poligoni/punti) e trasformazione
 * (sposta/ruota/scala). Renderizza le sagome 2D sopra i volumi 3D tramite
 * `depthCompare: 'always'` così che maniglie e vertici siano sempre visibili e cliccabili.
 */
export function createEditableScenarioLayer({
  scenario,
  activeTool,
  editMode,
  selectedFeatureIndexes,
  showTerrain3D,
  onEdit,
  onSelectFeatureIndex,
}: EditableScenarioLayerOptions): EditableGeoJsonLayer | null {
  if (!isEditingTool(activeTool) || !editMode) {
    return null;
  }

  return new EditableGeoJsonLayer({
    id: 'editable-scenario-2d',
    data: scenario as unknown as SimpleFeatureCollection,
    mode: editMode,
    selectedFeatureIndexes,
    pickable: true,
    filled: true,
    stroked: true,
    extensions: showTerrain3D ? [SHARED_TERRAIN_EXTENSION] : [],
    ...(showTerrain3D ? { terrainDrawMode: 'offset' as const } : {}),
    lineWidthMinPixels: 2,
    pointRadiusMinPixels: 6,
    pointRadiusMaxPixels: 10,
    editHandlePointRadiusMinPixels: 5,
    editHandlePointRadiusMaxPixels: 8,
    editHandlePointOutline: true,
    editHandlePointStrokeWidth: 2,
    // Disegna le sagome 2D e le maniglie di trasformazione sopra l'estrusione 3D
    parameters: {
      depthCompare: 'always',
      depthWriteEnabled: false,
    },
    getFillColor: (_feature, isSelected) =>
      isSelected ? [37, 99, 235, 95] : [30, 64, 175, 40],
    getLineColor: (_feature, isSelected) =>
      isSelected ? [30, 64, 175, 255] : [37, 99, 235, 210],
    getTentativeFillColor: [37, 99, 235, 80],
    getTentativeLineColor: [30, 64, 175, 255],
    getTentativeLineWidth: 2.5,
    getEditHandlePointColor: (handle) => {
      const handleType = handle?.properties?.editHandleType;
      if (handleType === 'rotate') return [217, 119, 6, 255];
      if (handleType === 'scale') return [15, 118, 110, 255];
      return [30, 64, 175, 255];
    },
    getEditHandlePointOutlineColor: [255, 255, 255, 255],
    onEdit,
    onClick: (info) => {
      // In modalità Sposta/Ruota il clic su una sagoma 2D seleziona l'elemento da trasformare
      if (activeTool === 'transform' && onSelectFeatureIndex) {
        if (typeof info.index === 'number' && info.index >= 0 && info.index < scenario.features.length) {
          // Ignora il clic se è una maniglia di guida
          const obj = info.object as { properties?: { guideType?: string } } | undefined;
          if (!obj?.properties?.guideType) {
            onSelectFeatureIndex(info.index);
            return true;
          }
        }
      }
      return false;
    },
  });
}
