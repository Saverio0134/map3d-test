import type { ScenarioCollection } from '../types/scenario';

/**
 * Strumento 5 — Elimina:
 * rimuove dallo scenario GeoJSON l'elemento aggiunto dall'utente (palazzo o albero)
 * identificato dal suo `id`.
 */
export function deleteScenarioFeature(
  scenario: ScenarioCollection,
  featureId: string
): ScenarioCollection {
  return {
    ...scenario,
    features: scenario.features.filter((feature) => feature.properties.id !== featureId),
  };
}
