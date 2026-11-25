/**
 * Utility per campionare la quota altimetrica reale (in metri s.l.m.) dalle tile DEM
 * pubbliche AWS Mapzen Terrarium (`elevation = R*256 + G + B/256 - 32768`).
 *
 * Serve a posizionare con precisione gli alberi 3D (`TreeLayer`) sulla superficie
 * del terreno 3D quando il rilievo è attivo, garantendo la stessa identica quota
 * usata da `TerrainLayer` (compreso l'eventuale fattore di esagerazione verticale).
 */

/** Endpoint pubblico AWS Mapzen Terrarium (senza chiave API, CORS `*`). */
export const TERRARIUM_ELEVATION_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Livello di zoom usato per il campionamento CPU delle quote (~38 m/pixel, 1 tile ≈ 25 KB). */
const ELEVATION_SAMPLE_ZOOM = 12;
const TILE_SIZE = 256;

const decoderCache = new Map<
  number,
  { rScaler: number; gScaler: number; bScaler: number; offset: number }
>();

/**
 * Restituisce l'`elevationDecoder` di `TerrainLayer` per il formato AWS Terrarium
 * scalato con l'eventuale fattore di esagerazione verticale (`exaggeration >= 1`).
 * L'oggetto è memorizzato in cache per mantenere stabile il riferimento in `updateTriggers`.
 */
export function getTerrariumElevationDecoder(exaggeration: number) {
  const k = Math.round(Math.max(0.5, Math.min(5, exaggeration)) * 100) / 100;
  let cached = decoderCache.get(k);
  if (!cached) {
    cached = {
      rScaler: 256 * k,
      gScaler: 1 * k,
      bScaler: (1 / 256) * k,
      offset: -32768 * k,
    };
    decoderCache.set(k, cached);
  }
  return cached;
}

/** Cache in memoria dei pixel RGBA decodificati per ogni tile Terrarium scaricata. */
const decodedTileCache = new Map<string, Uint8ClampedArray | null>();
const inflightTileLoads = new Map<string, Promise<boolean>>();

/**
 * Converte `[lon, lat]` in coordinate frazionarie di tile Web Mercator allo zoom `z`.
 */
function lonLatToTileCoords(
  lon: number,
  lat: number,
  z: number
): { tx: number; ty: number; px: number; py: number } {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, z);
  const fx = ((lon + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const fy =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const px = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((fx - tx) * TILE_SIZE)));
  const py = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((fy - ty) * TILE_SIZE)));

  return { tx, ty, px, py };
}

/**
 * Scarica una singola tile PNG Terrarium e ne memorizza i pixel RGBA via canvas offscreen.
 * Restituisce `true` se ha popolato nuovi dati in cache.
 */
function loadTerrariumTile(z: number, x: number, y: number): Promise<boolean> {
  const key = `${z}/${x}/${y}`;
  if (decodedTileCache.has(key)) {
    return Promise.resolve(false);
  }
  const existing = inflightTileLoads.get(key);
  if (existing) {
    return existing;
  }

  const url = TERRARIUM_ELEVATION_URL.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          decodedTileCache.set(key, null);
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
        const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
        decodedTileCache.set(key, imageData.data);
        resolve(true);
      } catch {
        decodedTileCache.set(key, null);
        resolve(false);
      } finally {
        inflightTileLoads.delete(key);
      }
    };
    img.onerror = () => {
      decodedTileCache.set(key, null);
      inflightTileLoads.delete(key);
      resolve(false);
    };
    img.src = url;
  });

  inflightTileLoads.set(key, promise);
  return promise;
}

/**
 * Precarica in parallelo le tile Terrarium necessarie a coprire una lista di coordinate `[lon, lat]`.
 * Restituisce `true` se almeno una nuova tile è stata scaricata e decodificata.
 */
export async function prefetchTerrainElevations(
  coords: [number, number][]
): Promise<boolean> {
  if (coords.length === 0) return false;

  const uniqueTiles = new Map<string, [number, number, number]>();
  for (const [lon, lat] of coords) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const { tx, ty } = lonLatToTileCoords(lon, lat, ELEVATION_SAMPLE_ZOOM);
    const key = `${ELEVATION_SAMPLE_ZOOM}/${tx}/${ty}`;
    if (!decodedTileCache.has(key) && !uniqueTiles.has(key)) {
      uniqueTiles.set(key, [ELEVATION_SAMPLE_ZOOM, tx, ty]);
    }
  }

  if (uniqueTiles.size === 0) return false;

  const results = await Promise.all(
    Array.from(uniqueTiles.values()).map(([z, x, y]) => loadTerrariumTile(z, x, y))
  );
  return results.some(Boolean);
}

/**
 * Restituisce la quota del terreno in metri (scalata con `exaggeration`) per `[lon, lat]`
 * dalla cache locale delle tile Terrarium, oppure `0` se la tile non è ancora pronta.
 */
export function getCachedTerrainElevation(
  lon: number,
  lat: number,
  exaggeration = 1
): number {
  const { tx, ty, px, py } = lonLatToTileCoords(lon, lat, ELEVATION_SAMPLE_ZOOM);
  const key = `${ELEVATION_SAMPLE_ZOOM}/${tx}/${ty}`;
  const pixels = decodedTileCache.get(key);
  if (!pixels) return 0;

  const idx = (py * TILE_SIZE + px) * 4;
  const r = pixels[idx];
  const g = pixels[idx + 1];
  const b = pixels[idx + 2];

  const rawMeters = r * 256 + g + b / 256 - 32768;
  return Number.isFinite(rawMeters) ? rawMeters * exaggeration : 0;
}
