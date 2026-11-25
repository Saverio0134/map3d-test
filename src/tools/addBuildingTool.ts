import {
  DrawPolygonMode,
  type EditAction,
  type SimpleFeatureCollection,
} from '@deck.gl-community/editable-layers';
import type { Polygon } from 'geojson';
import type {
  BuildingCreationDefaults,
  BuildingFeature,
  ScenarioCollection,
} from '../types/scenario';
import { ensureCounterClockwisePolygon, generateFeatureId } from '../utils/geometry';

/**
 * Strumento 2 — Aggiungi palazzo:
 * istanzia `DrawPolygonMode` per disegnare la sagoma 2D del nuovo edificio.
 */
export function createAddBuildingMode(): DrawPolygonMode {
  return new DrawPolygonMode();
}

export interface AddBuildingEditResult {
  scenario: ScenarioCollection;
  createdFeatureId: string | null;
}

/**
 * Gestisce l'evento `onEdit` di `EditableGeoJsonLayer` in modalità `DrawPolygonMode`.
 * Quando il disegno viene completato (`editType === 'addFeature'`), corregge l'ordine
 * dei vertici (anello esterno antiorario) e aggiunge il nuovo palazzo allo scenario
 * con altezza predefinita (15 m) e colore scelto.
 */
export function applyAddBuildingEdit(
  currentScenario: ScenarioCollection,
  action: EditAction<SimpleFeatureCollection>,
  defaults: BuildingCreationDefaults
): AddBuildingEditResult | null {
  if (action.editType !== 'addFeature') {
    return null;
  }

  const addedIndexes = action.editContext?.featureIndexes ?? [];
  const addedIndex =
    addedIndexes.length > 0
      ? addedIndexes[addedIndexes.length - 1]
      : action.updatedData.features.length - 1;

  const rawFeature = action.updatedData.features[addedIndex];
  if (!rawFeature || rawFeature.geometry.type !== 'Polygon') {
    return null;
  }

  // Corregge l'ordine dei vertici: anello esterno antiorario per evitare facce capovolte in 3D
  const normalizedPolygon = ensureCounterClockwisePolygon(rawFeature.geometry as Polygon);
  const ring = normalizedPolygon.coordinates[0];
  if (!ring || ring.length < 4) {
    return null;
  }

  const newBuilding: BuildingFeature = {
    type: 'Feature',
    geometry: normalizedPolygon,
    properties: {
      id: generateFeatureId('building'),
      kind: 'building',
      height: defaults.height,
      color: defaults.color,
    },
  };

  return {
    scenario: {
      ...currentScenario,
      features: [...currentScenario.features, newBuilding],
    },
    createdFeatureId: newBuilding.properties.id,
  };
}
