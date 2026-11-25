import {
  DrawPointMode,
  type EditAction,
  type SimpleFeatureCollection,
} from '@deck.gl-community/editable-layers';
import type { Point } from 'geojson';
import type {
  ScenarioCollection,
  TreeCreationDefaults,
  TreeFeature,
} from '../types/scenario';
import { generateFeatureId, randomInRange } from '../utils/geometry';

/**
 * Strumento 3 — Aggiungi albero:
 * istanzia `DrawPointMode` per posizionare alberi 3D con un singolo clic sulla mappa.
 */
export function createAddTreeMode(): DrawPointMode {
  return new DrawPointMode();
}

export interface AddTreeEditResult {
  scenario: ScenarioCollection;
  createdFeatureId: string | null;
}

/**
 * Gestisce l'evento `onEdit` in modalità `DrawPointMode`.
 * Ogni clic genera una nuova feature Point nello scenario con la specie scelta
 * nel pannello proprietà, un'altezza casuale nell'intervallo configurato (es. 6–12 m)
 * e un raggio chioma proporzionale.
 */
export function applyAddTreeEdit(
  currentScenario: ScenarioCollection,
  action: EditAction<SimpleFeatureCollection>,
  defaults: TreeCreationDefaults
): AddTreeEditResult | null {
  if (action.editType !== 'addFeature') {
    return null;
  }

  const addedIndexes = action.editContext?.featureIndexes ?? [];
  const addedIndex =
    addedIndexes.length > 0
      ? addedIndexes[addedIndexes.length - 1]
      : action.updatedData.features.length - 1;

  const rawFeature = action.updatedData.features[addedIndex];
  if (!rawFeature || rawFeature.geometry.type !== 'Point') {
    return null;
  }

  const coords = (rawFeature.geometry as Point).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }

  const height = randomInRange(defaults.minHeight, defaults.maxHeight);

  const newTree: TreeFeature = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [coords[0], coords[1]],
    },
    properties: {
      id: generateFeatureId('tree'),
      kind: 'tree',
      species: defaults.species,
      height,
      crownRadius: defaults.crownRadius,
    },
  };

  return {
    scenario: {
      ...currentScenario,
      features: [...currentScenario.features, newTree],
    },
    createdFeatureId: newTree.properties.id,
  };
}
