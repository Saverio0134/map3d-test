import { TreeLayer } from '@deck.gl-community/layers';
import type { ToolMode, TreeFeature } from '../types/scenario';

interface UserTreesLayerOptions {
  /** Alberi aggiunti dall'utente estratti dallo scenario GeoJSON. */
  trees: TreeFeature[];
  /** ID dell'albero attualmente selezionato. */
  selectedFeatureId: string | null;
  /** Strumento attivo nell'editor. */
  activeTool: ToolMode;
  /** Funzione opzionale che restituisce la quota del terreno 3D in metri per `[lon, lat]`. */
  getGroundElevation?: (lon: number, lat: number) => number;
  /** Revisione incrementale della cache altimetrica / esagerazione terreno per invalidare TreeLayer. */
  terrainRevision?: number;
  /** Callback chiamata al clic su un albero utente. */
  onTreeClick?: (feature: TreeFeature) => void;
}

/**
 * Calcola una firma deterministica di tutte le proprietà geometriche e botaniche
 * degli alberi utente così da invalidare immediatamente i sub-layer (`SplatLayer` e
 * `TreeWoodLayer`) ad ogni variazione di specie, altezza, raggio chioma o posizione.
 */
function buildTreesSignature(trees: TreeFeature[], terrainRevision: number): string {
  const base = trees
    .map((f) => {
      const { id, species, height, crownRadius } = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return `${id}:${species}:${height}:${crownRadius}:${lon.toFixed(6)}:${lat.toFixed(6)}`;
    })
    .join('|');
  return `${terrainRevision}#${base}`;
}

/**
 * Layer 3D degli alberi aggiunti dall'utente.
 * Utilizza `TreeLayer` di `@deck.gl-community/layers` 9.4 leggendo esclusivamente
 * dalle feature Point dello scenario GeoJSON (specie, altezza, raggio chioma).
 */
export function createUserTreesLayer({
  trees,
  selectedFeatureId,
  activeTool,
  getGroundElevation,
  terrainRevision = 0,
  onTreeClick,
}: UserTreesLayerOptions): TreeLayer<TreeFeature> | null {
  if (trees.length === 0) {
    return null;
  }

  const isDeleteMode = activeTool === 'delete';
  const treesSignature = buildTreesSignature(trees, terrainRevision);

  return new TreeLayer<TreeFeature>({
    id: 'user-scenario-trees-3d',
    data: trees,
    pickable: true,
    autoHighlight: activeTool === 'view' || activeTool === 'delete' || activeTool === 'transform',
    highlightColor: isDeleteMode ? [220, 38, 38, 190] : [37, 99, 235, 130],
    shadowEnabled: false,
    getTree: (feature) => {
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      const groundZ = getGroundElevation ? getGroundElevation(lon, lat) : 0;
      return {
        position: [lon, lat, groundZ] as [number, number, number],
        species: feature.properties.species,
        height: feature.properties.height,
        crownRadius: feature.properties.crownRadius,
        // Il ciliegio usa la fioritura primaverile per essere subito riconoscibile
        season: feature.properties.species === 'cherry' ? 'spring' : 'summer',
      };
    },
    // `all` si propaga ai sub-layer SplatLayer/SplatPrimitiveLayer e TreeWoodLayer
    // garantendo il ricalcolo immediato quando cambia `crownRadius` o la quota del terreno
    updateTriggers: {
      all: [treesSignature],
      getTree: [treesSignature, selectedFeatureId],
    },
    onClick: (info) => {
      if (!info.object || !onTreeClick) return false;
      const raw = info.object as TreeFeature | { object?: TreeFeature };
      const feature = 'properties' in raw ? raw : raw?.object;
      if (!feature) return false;
      onTreeClick(feature);
      return true;
    },
  });
}
