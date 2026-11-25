import {
  TransformMode,
  type EditAction,
  type SimpleFeatureCollection,
} from '@deck.gl-community/editable-layers';
import type { Point, Polygon } from 'geojson';
import {
  isBuildingFeature,
  isTreeFeature,
  type ScenarioCollection,
  type ScenarioFeature,
} from '../types/scenario';
import { ensureCounterClockwisePolygon } from '../utils/geometry';

/**
 * Strumento 4 — Sposta / Ruota:
 * istanzia `TransformMode` (che combina traslazione, rotazione e scala)
 * sugli elementi aggiunti dall'utente.
 */
export function createTransformMode(): TransformMode {
  return new TransformMode();
}

/**
 * Applica gli aggiornamenti geometrici prodotti da `TransformMode` mantenendo
 * intatte le proprietà applicative di ogni edificio/albero e garantendo
 * che i poligoni conservino sempre l'ordine antiorario dell'anello esterno.
 */
export function applyTransformEdit(
  currentScenario: ScenarioCollection,
  action: EditAction<SimpleFeatureCollection>
): ScenarioCollection | null {
  const updatedFeatures = action.updatedData?.features;
  if (!Array.isArray(updatedFeatures) || updatedFeatures.length !== currentScenario.features.length) {
    return null;
  }

  const mergedFeatures: ScenarioFeature[] = currentScenario.features.map((original, index) => {
    const edited = updatedFeatures[index];
    if (!edited || !edited.geometry) return original;

    if (isBuildingFeature(original) && edited.geometry.type === 'Polygon') {
      return {
        ...original,
        geometry: ensureCounterClockwisePolygon(edited.geometry as Polygon),
      };
    }

    if (isTreeFeature(original) && edited.geometry.type === 'Point') {
      const coords = (edited.geometry as Point).coordinates;
      return {
        ...original,
        geometry: {
          type: 'Point',
          coordinates: [coords[0], coords[1]],
        },
      };
    }

    return original;
  });

  return {
    ...currentScenario,
    features: mergedFeatures,
  };
}
