import { BitmapLayer, TerrainLayer, TileLayer } from 'deck.gl';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { TerrainLoader } from '@loaders.gl/terrain';
import type { BasemapStyleId } from '../types/scenario';
import {
  TERRARIUM_ELEVATION_URL,
  getTerrariumElevationDecoder,
} from '../utils/terrainElevation';

/**
 * Istanza condivisa di `TerrainExtension` riutilizzata da tutti i layer che si adattano
 * al rilievo 3D (edifici esistenti, edifici utente, temperatura al suolo, layer editing)
 * per evitare ricompilazioni inutili degli shader WebGL.
 */
export const SHARED_TERRAIN_EXTENSION = new TerrainExtension();

/**
 * URL delle tile raster gratuite (senza API key, CORS `*`) usate come texture
 * drappeggiata sulla mesh 3D di `TerrainLayer` e per la modalità Satellite 2D:
 * - `bright` (Stradario): OpenStreetMap DE (strade, parchi, stazioni e toponimi italiani nitidi)
 * - `satellite` (Satellite): Esri World Imagery (ortofoto ad alta risoluzione)
 * - `positron` (Chiaro): Esri World Street Map (tavolozza chiara architettonica con nomi vie leggibili)
 */
const BASEMAP_RASTER_URLS: Record<BasemapStyleId, string> = {
  bright: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  positron:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
};

/**
 * Stili vettoriali MapLibre 100% OpenFreeMap (gratuiti, senza API key e privi di layer
 * `fill-extrusion` così da non sovrapporsi agli edifici 3D editabili di deck.gl).
 */
export const MAPLIBRE_STYLE_URLS: Record<BasemapStyleId, string> = {
  bright: 'https://tiles.openfreemap.org/styles/bright',
  satellite: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
};

interface BasemapTerrainLayerOptions {
  /** Stile della cartografia 2D (stradario, satellite o chiaro). */
  basemapStyle: BasemapStyleId;
  /** Se true attiva i rilievi 3D reali del terreno (AWS Terrarium DEM + TerrainLayer). */
  showTerrain3D: boolean;
  /** Fattore di esagerazione verticale del rilievo 3D (1.0x = reale, fino a 3.0x). */
  terrainExaggeration: number;
}

/**
 * Versione in-thread di `TerrainLoader` (`worker: false`):
 * `@loaders.gl/terrain` imposta di default `worker: true`, che tenta di caricare
 * un Web Worker cross-origin da `unpkg.com` (bloccato dalla policy same-origin nei browser/iframe).
 * Forzando `worker: false` la tassellazione Martini avviene localmente in memoria senza errori.
 */
const IN_THREAD_TERRAIN_LOADER = {
  ...TerrainLoader,
  worker: false,
};

/** Opzioni stabili per evitare worker remoti su TerrainLayer. */
const TERRAIN_LOAD_OPTIONS = {
  worker: false,
};

/**
 * Crea i layer di sfondo della scena disaccoppiando la mesh 3D dei rilievi dalla risoluzione della basemap:
 * - Con `showTerrain3D = true`:
 *   1) `TerrainLayer` (`operation: 'terrain+draw'`, fino a zoom 15) genera la sola mesh 3D
 *      altimetrica da AWS Terrarium DEM con ombreggiatura naturale dei pendii e fornisce la
 *      height-map GPU a `_TerrainExtension` (ID stabile: non ricarica il DEM al cambio basemap).
 *   2) `TileLayer` + `BitmapLayer` ad alta risoluzione (fino a zoom 18, `terrainDrawMode: 'drape'`)
 *      drappeggia la cartografia nitida sopra la mesh 3D tramite `TerrainCover` (fino a 2048×2048 px
 *      per tile DEM), evitando il blocco a bassa risoluzione di zoom 15.
 * - Con `showTerrain3D = false`:
 *   - Per `bright` (Stradario) e `positron` (Chiaro) restituisce `[]` lasciando emergere
 *     direttamente la mappa vettoriale nativa **OpenFreeMap** di `<MapLibreMap>`.
 *   - Per `satellite` restituisce il `TileLayer` + `BitmapLayer` con ortofoto gratuite Esri.
 */
export function createBasemapTerrainLayers({
  basemapStyle,
  showTerrain3D,
  terrainExaggeration,
}: BasemapTerrainLayerOptions): (TerrainLayer | TileLayer)[] {
  const textureUrl = BASEMAP_RASTER_URLS[basemapStyle];

  if (showTerrain3D) {
    // 1) Mesh 3D altimetrica pura (AWS Terrarium DEM) con ombreggiatura morbida sui versanti
    const terrainMeshLayer = new TerrainLayer({
      id: 'terrain-3d-relief',
      operation: 'terrain+draw',
      minZoom: 0,
      maxZoom: 15,
      tileSize: 256,
      elevationData: TERRARIUM_ELEVATION_URL,
      elevationDecoder: getTerrariumElevationDecoder(terrainExaggeration),
      loaders: [IN_THREAD_TERRAIN_LOADER],
      loadOptions: TERRAIN_LOAD_OPTIONS,
      meshMaxError: 2.5,
      color: [215, 222, 232],
      wireframe: false,
      pickable: false,
      material: {
        ambient: 0.48,
        diffuse: 0.72,
        shininess: 1,
        specularColor: [0, 0, 0],
      },
    });

    // 2) Basemap raster ad alta risoluzione (fino a zoom 18) drappeggiata sulla mesh 3D
    //    con opacità 0.92 così i colori restano fedeli e traspare l'ombreggiatura 3D dei rilievi.
    const drapedBasemapLayer = new TileLayer({
      id: `basemap-3d-draped-${basemapStyle}`,
      data: textureUrl,
      minZoom: 0,
      maxZoom: 18,
      tileSize: 256,
      pickable: false,
      extensions: [SHARED_TERRAIN_EXTENSION],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ terrainDrawMode: 'drape' } as any),
      renderSubLayers: (props) => {
        const bbox = props.tile?.bbox as
          | { west: number; south: number; east: number; north: number }
          | undefined;
        if (!bbox || !props.data) return null;

        const { data: tileImage, ...restProps } = props;
        return new BitmapLayer(restProps, {
          data: undefined,
          image: tileImage,
          bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
          opacity: 0.92,
          extensions: [SHARED_TERRAIN_EXTENSION],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...({ terrainDrawMode: 'drape' } as any),
        });
      },
    });

    return [terrainMeshLayer, drapedBasemapLayer];
  }

  // In modalità piana 2D lascia visibile la basemap vettoriale OpenFreeMap di MapLibre
  // per Stradario e Chiaro; usa il TileLayer raster solo per le ortofoto Satellite.
  if (basemapStyle !== 'satellite') {
    return [];
  }

  return [
    new TileLayer({
      id: `basemap-2d-${basemapStyle}`,
      data: textureUrl,
      minZoom: 0,
      maxZoom: 18,
      tileSize: 256,
      pickable: false,
      renderSubLayers: (props) => {
        const bbox = props.tile?.bbox as
          | { west: number; south: number; east: number; north: number }
          | undefined;
        if (!bbox || !props.data) return null;

        const { data: tileImage, ...restProps } = props;
        return new BitmapLayer(restProps, {
          data: undefined,
          image: tileImage,
          bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
        });
      },
    }),
  ];
}
