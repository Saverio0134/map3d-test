import type { ScenarioCollection } from '../types/scenario';

/**
 * Aggiorna l'altezza personalizzata (in metri, 3–150 m) di un edificio esistente
 * della città (proveniente dalle tile MVT di OpenFreeMap) nello scenario.
 */
export function setExistingBuildingHeight(
  scenario: ScenarioCollection,
  buildingId: string,
  height: number
): ScenarioCollection {
  if (!buildingId || !Number.isFinite(height)) {
    return scenario;
  }
  const clamped = Math.min(150, Math.max(3, Math.round(height)));
  return {
    ...scenario,
    existingBuildingHeights: {
      ...scenario.existingBuildingHeights,
      [buildingId]: clamped,
    },
  };
}

/**
 * Ripristina l'altezza originale OpenFreeMap di un singolo edificio esistente.
 */
export function resetExistingBuildingHeight(
  scenario: ScenarioCollection,
  buildingId: string
): ScenarioCollection {
  if (!(buildingId in scenario.existingBuildingHeights)) {
    return scenario;
  }
  const nextHeights = { ...scenario.existingBuildingHeights };
  delete nextHeights[buildingId];
  return {
    ...scenario,
    existingBuildingHeights: nextHeights,
  };
}

/**
 * Ripristina le altezze originali di tutti gli edifici esistenti modificati.
 */
export function resetAllExistingBuildingHeights(
  scenario: ScenarioCollection
): ScenarioCollection {
  if (Object.keys(scenario.existingBuildingHeights).length === 0) {
    return scenario;
  }
  return {
    ...scenario,
    existingBuildingHeights: {},
  };
}
