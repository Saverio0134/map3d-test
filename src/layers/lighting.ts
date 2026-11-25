import { AmbientLight, DirectionalLight, LightingEffect } from 'deck.gl';

/**
 * Crea l'effetto di illuminazione 3D per la scena urbana:
 * - luce ambientale morbida per evitare ombre completamente nere;
 * - luce direzionale principale (sole diurno da sud-ovest) per modellare
 *   i volumi degli edifici e le chiome degli alberi 3D;
 * - luce di riempimento opposta a bassa intensità per staccare le facciate in ombra.
 */
export function createUrbanLightingEffect(): LightingEffect {
  const ambientLight = new AmbientLight({
    color: [240, 244, 250],
    intensity: 0.55,
  });

  const sunLight = new DirectionalLight({
    color: [255, 248, 236],
    intensity: 0.85,
    direction: [-1.4, -2.0, -2.6],
  });

  const fillLight = new DirectionalLight({
    color: [215, 228, 246],
    intensity: 0.25,
    direction: [1.6, 1.4, -1.8],
  });

  return new LightingEffect({
    ambientLight,
    sunLight,
    fillLight,
  });
}
