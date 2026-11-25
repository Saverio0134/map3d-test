import type { OsmTreeRecord, TreeSpecies } from '../types/scenario';

/** Mirror Overpass API interrogati in parallelo con timeout rapido. */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Fallback ufficiale OpenStreetMap API v0.6 (supporta CORS e JSON senza API key),
 * usato automaticamente quando i mirror Overpass sono saturi (502/429/timeout).
 */
const OSM_API_MAP_ENDPOINT = 'https://api.openstreetmap.org/api/0.6/map.json';

const MAX_OSM_TREES = 2000;
const DEFAULT_OSM_TREE_HEIGHT = 8;
const OVERPASS_TIMEOUT_MS = 4500;
const OSM_FALLBACK_TIMEOUT_MS = 12000;

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
  /** Centro effettivo della camera 3D (utile con pitch elevato per centrare la query). */
  centerLat?: number;
  centerLon?: number;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OsmJsonResponse {
  elements?: OsmElement[];
}

/**
 * Estrae l'altezza in metri dal tag OSM `height` (es. "12", "12 m", "9.5m").
 * Se assente o non valido, restituisce il valore predefinito di 8 m.
 */
function parseOsmHeight(tags?: Record<string, string>): number {
  const raw = tags?.height ?? tags?.['est_height'];
  if (!raw) return DEFAULT_OSM_TREE_HEIGHT;
  const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!match) return DEFAULT_OSM_TREE_HEIGHT;
  const parsed = parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_OSM_TREE_HEIGHT;
  return Math.min(45, Math.max(2, parsed));
}

/**
 * Mappa eventuali tag botanici OSM (`leaf_type`, `genus`, `species`, `taxon`)
 * verso una delle specie procedurali supportate da TreeLayer.
 */
function inferSpeciesFromOsmTags(tags?: Record<string, string>): TreeSpecies {
  if (!tags) return 'oak';
  const combined = `${tags.genus ?? ''} ${tags.species ?? ''} ${tags.taxon ?? ''}`.toLowerCase();
  if (
    combined.includes('pinus') ||
    combined.includes('picea') ||
    combined.includes('abies') ||
    combined.includes('cedrus') ||
    tags.leaf_type === 'needleleaved'
  ) {
    return 'pine';
  }
  if (combined.includes('betula')) return 'birch';
  if (combined.includes('prunus') || combined.includes('cerasus')) return 'cherry';
  if (
    combined.includes('phoenix') ||
    combined.includes('trachycarpus') ||
    combined.includes('palm')
  ) {
    return 'palm';
  }
  if (combined.includes('citrus')) return 'citrus';
  if (combined.includes('ficus')) return 'banyan';
  return 'oak';
}

/**
 * Estrae il raggio della chioma dai tag OSM (`diameter_crown`) oppure lo stima dall'altezza.
 */
function parseCrownRadius(tags: Record<string, string> | undefined, height: number): number {
  const rawDiameter = tags?.diameter_crown;
  if (rawDiameter) {
    const match = rawDiameter.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const radius = parseFloat(match[1]) / 2;
      if (Number.isFinite(radius) && radius >= 0.8 && radius <= 18) {
        return Math.round(radius * 10) / 10;
      }
    }
  }
  return Math.round(Math.max(1.8, Math.min(7, height * 0.32)) * 10) / 10;
}

/**
 * Limita l'ampiezza del riquadro geografico centrandolo sul punto inquadrato dalla camera 3D.
 */
function clampBoundingBox(
  bbox: BoundingBox,
  maxLatSpan: number,
  maxLonSpan: number
): BoundingBox {
  const centerLat = bbox.centerLat ?? (bbox.south + bbox.north) / 2;
  const centerLon = bbox.centerLon ?? (bbox.west + bbox.east) / 2;
  const halfLat = Math.min(Math.max(0.001, (bbox.north - bbox.south) / 2), maxLatSpan / 2);
  const halfLon = Math.min(Math.max(0.001, (bbox.east - bbox.west) / 2), maxLonSpan / 2);

  return {
    south: centerLat - halfLat,
    north: centerLat + halfLat,
    west: centerLon - halfLon,
    east: centerLon + halfLon,
    centerLat,
    centerLon,
  };
}

/**
 * Crea un AbortController con timeout locale collegato anche al segnale di annullamento esterno.
 */
function createTimedController(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/**
 * Converte gli elementi JSON OSM (`node["natural"="tree"]`) in record pronti per `TreeLayer`.
 */
function mapOsmElementsToTrees(elements: OsmElement[], requireTreeTag: boolean): OsmTreeRecord[] {
  return elements
    .filter(
      (el) =>
        el.type === 'node' &&
        typeof el.lon === 'number' &&
        typeof el.lat === 'number' &&
        Number.isFinite(el.lon) &&
        Number.isFinite(el.lat) &&
        (!requireTreeTag || el.tags?.natural === 'tree')
    )
    .slice(0, MAX_OSM_TREES)
    .map((el) => {
      const height = parseOsmHeight(el.tags);
      return {
        id: `osm-tree-${el.id}`,
        position: [el.lon as number, el.lat as number] as [number, number],
        height,
        species: inferSpeciesFromOsmTags(el.tags),
        crownRadius: parseCrownRadius(el.tags, height),
      };
    });
}

/**
 * Interroga un singolo mirror Overpass API con timeout rapido.
 */
async function querySingleOverpassEndpoint(
  endpoint: string,
  query: string,
  externalSignal?: AbortSignal
): Promise<OsmTreeRecord[]> {
  const { signal, cleanup } = createTimedController(OVERPASS_TIMEOUT_MS, externalSignal);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OsmJsonResponse;
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    return mapOsmElementsToTrees(elements, false);
  } finally {
    cleanup();
  }
}

/**
 * Fallback diretto sull'API ufficiale OpenStreetMap v0.6 (`/api/0.6/map.json`).
 * Se il centro urbano supera il limite di 50.000 nodi (HTTP 400), restringe
 * automaticamente il riquadro attorno al centro inquadrato e riprova una volta.
 */
async function fetchTreesViaOsmApiFallback(
  rawBbox: BoundingBox,
  externalSignal?: AbortSignal
): Promise<OsmTreeRecord[]> {
  const attempts: [number, number][] = [
    [0.0084, 0.011],
    [0.0052, 0.0068],
  ];

  let lastError: Error | null = null;

  for (const [maxLatSpan, maxLonSpan] of attempts) {
    const bbox = clampBoundingBox(rawBbox, maxLatSpan, maxLonSpan);
    const bboxParam = `${bbox.west.toFixed(6)},${bbox.south.toFixed(6)},${bbox.east.toFixed(6)},${bbox.north.toFixed(6)}`;
    const url = `${OSM_API_MAP_ENDPOINT}?bbox=${bboxParam}`;
    const { signal, cleanup } = createTimedController(OSM_FALLBACK_TIMEOUT_MS, externalSignal);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal,
      });

      if (response.status === 400) {
        // Area troppo densa (> 50.000 nodi): riprova con riquadro più stretto
        lastError = new Error('Area troppo densa per OSM API, restringimento riquadro.');
        continue;
      }

      if (!response.ok) {
        throw new Error(`Errore HTTP ${response.status} da OpenStreetMap API`);
      }

      const payload = (await response.json()) as OsmJsonResponse;
      const elements = Array.isArray(payload.elements) ? payload.elements : [];
      return mapOsmElementsToTrees(elements, true);
    } catch (err) {
      if (externalSignal?.aborted) {
        throw err;
      }
      lastError =
        err instanceof Error ? err : new Error('Errore durante il caricamento da OpenStreetMap.');
    } finally {
      cleanup();
    }
  }

  throw lastError ?? new Error('Impossibile caricare gli alberi da OpenStreetMap.');
}

/**
 * Carica gli alberi esistenti (`node["natural"="tree"]`) nel riquadro visibile della mappa
 * (massimo 2000 risultati):
 * 1. interroga i mirror Overpass API in parallelo con timeout rapido;
 * 2. se i server Overpass sono temporaneamente saturi (502/429/timeout), attiva
 *    automaticamente il fallback sull'API ufficiale OpenStreetMap v0.6.
 */
export async function fetchOsmTreesInBounds(
  rawBbox: BoundingBox,
  signal?: AbortSignal
): Promise<OsmTreeRecord[]> {
  const overpassBbox = clampBoundingBox(rawBbox, 0.026, 0.032);
  const bboxStr = `${overpassBbox.south.toFixed(6)},${overpassBbox.west.toFixed(6)},${overpassBbox.north.toFixed(6)},${overpassBbox.east.toFixed(6)}`;
  const query = `[out:json][timeout:10];node["natural"="tree"](${bboxStr});out body ${MAX_OSM_TREES};`;

  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.map((endpoint) => querySingleOverpassEndpoint(endpoint, query, signal))
    );
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
    // Overpass momentaneamente sovraccarico: passa subito all'API ufficiale OpenStreetMap v0.6
    return fetchTreesViaOsmApiFallback(rawBbox, signal);
  }
}

