import type { ScenarioCollection, ScenarioFeature } from '../types/scenario';

/**
 * Strumento 1 — Vista:
 * gestisce la selezione di un elemento aggiunto dallo scenario (palazzo o albero)
 * per aprirne l'ispezione nel pannello proprietà durante la navigazione normale.
 */
export function selectFeatureInViewMode(
  scenario: ScenarioCollection,
  clickedFeature: ScenarioFeature | null
): string | null {
  if (!clickedFeature) return null;
  const exists = scenario.features.some((f) => f.properties.id === clickedFeature.properties.id);
  return exists ? clickedFeature.properties.id : null;
}
