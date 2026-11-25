import { TreeLayer } from '@deck.gl-community/layers';
import type { OsmTreeRecord } from '../types/scenario';

interface OsmTreesLayerOptions {
  /** Alberi esistenti scaricati da OpenStreetMap tramite Overpass API. */
  trees: OsmTreeRecord[];
  /** Visibilità del layer degli alberi OSM esistenti. */
  visible: boolean;
  /** Funzione opzionale che restituisce la quota del terreno 3D in metri per `[lon, lat]`. */
  getGroundElevation?: (lon: number, lat: number) => number;
  /** Revisione incrementale della cache altimetrica / esagerazione terreno per invalidare TreeLayer. */
  terrainRevision?: number;
}

/**
 * Layer 3D per gli alberi esistenti della città provenienti da OpenStreetMap.
 * Utilizza `TreeLayer` di `@deck.gl-community/layers` 9.4 con l'altezza del tag OSM
 * `height` (oppure 8 m di default) appoggiato alla quota del terreno 3D.
 */
export function createOsmTreesLayer({
  trees,
  visible,
  getGroundElevation,
  terrainRevision = 0,
}: OsmTreesLayerOptions): TreeLayer<OsmTreeRecord> | null {
  if (!visible || trees.length === 0) {
    return null;
  }

  const treesSignature = `${terrainRevision}#${trees.length}:${trees[0]?.id ?? ''}:${trees[trees.length - 1]?.id ?? ''}`;

  return new TreeLayer<OsmTreeRecord>({
    id: 'existing-osm-trees-3d',
    data: trees,
    pickable: false,
    shadowEnabled: false,
    getTree: (tree) => {
      const [lon, lat] = tree.position;
      const groundZ = getGroundElevation ? getGroundElevation(lon, lat) : 0;
      return {
        position: [lon, lat, groundZ] as [number, number, number],
        species: tree.species,
        height: tree.height,
        crownRadius: tree.crownRadius,
        season: tree.species === 'cherry' ? 'spring' : 'summer',
      };
    },
    updateTriggers: {
      all: [treesSignature],
      getTree: [treesSignature],
    },
  });
}
