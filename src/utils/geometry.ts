import type { Polygon, Position } from 'geojson';
import type { Color } from 'deck.gl';

/**
 * Calcola l'area con segno di un anello di coordinate [lon, lat] (formula di Gauss / Shoelace).
 * In coordinate planari (lon = X, lat = Y):
 * - valore positivo (> 0) => orientamento ANTIORARIO (CCW)
 * - valore negativo (< 0) => orientamento ORARIO (CW)
 */
export function computeRingSignedArea(ring: Position[]): number {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/**
 * Assicura che un anello sia chiuso correttamente (primo e ultimo vertice coincidenti)
 * rimuovendo eventuali vertici consecutivi duplicati.
 */
function normalizeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return [];
  const cleaned: Position[] = [];
  for (const pt of ring) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) {
      cleaned.push([pt[0], pt[1]]);
    }
  }
  if (cleaned.length > 0) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      cleaned.push([first[0], first[1]]);
    }
  }
  return cleaned;
}

/**
 * Corregge l'ordine dei vertici di un poligono GeoJSON per l'estrusione 3D in deck.gl:
 * - l'anello esterno (indice 0) deve essere ANTIORARIO (signedArea > 0), altrimenti
 *   le normali delle facce laterali risultano invertite (facce capovolte).
 * - gli eventuali anelli interni / fori (indice >= 1) devono essere ORARI (signedArea < 0).
 */
export function ensureCounterClockwisePolygon(polygon: Polygon): Polygon {
  const normalizedRings = polygon.coordinates.map((ring, ringIndex) => {
    const closed = normalizeRing(ring);
    if (closed.length < 4) return closed;

    const signedArea = computeRingSignedArea(closed);
    if (ringIndex === 0) {
      // Anello esterno: forzato in senso antiorario (area con segno positiva)
      return signedArea < 0 ? [...closed].reverse() : closed;
    }
    // Eventuali fori interni: forzati in senso orario (area con segno negativa)
    return signedArea > 0 ? [...closed].reverse() : closed;
  });

  return {
    type: 'Polygon',
    coordinates: normalizedRings,
  };
}

/**
 * Converte un colore esadecimale (es. "#D97757") in un vettore RGBA [r, g, b, a] per deck.gl.
 */
export function hexToRgba(hex: string, alpha = 255): Color {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b, alpha];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b, alpha];
    }
  }
  return [217, 119, 87, alpha];
}

/**
 * Genera un identificatore univoco e leggibile per le nuove feature dello scenario.
 */
export function generateFeatureId(prefix: 'building' | 'tree'): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

/**
 * Estrae o sintetizza un ID deterministico per un edificio proveniente dalle tile MVT di OpenFreeMap.
 * Se la feature ha un ID nativo OSM/MVT lo usa direttamente; altrimenti ricava una chiave stabile
 * dalle coordinate arrotondate del primo vertice così da rimanere identica tra esportazione e importazione.
 */
export function getExistingBuildingId(feature: {
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown };
}): string {
  if (feature.id !== undefined && feature.id !== null && String(feature.id).length > 0) {
    return String(feature.id);
  }
  const propId = feature.properties?.id ?? feature.properties?.osm_id;
  if (propId !== undefined && propId !== null && String(propId).length > 0) {
    return String(propId);
  }

  // Fallback deterministico basato sul primo vertice della geometria
  const coords = feature.geometry?.coordinates;
  let firstCoord: number[] | null = null;
  if (Array.isArray(coords)) {
    let cursor: unknown = coords;
    while (Array.isArray(cursor) && Array.isArray(cursor[0])) {
      cursor = cursor[0];
    }
    if (Array.isArray(cursor) && typeof cursor[0] === 'number' && typeof cursor[1] === 'number') {
      firstCoord = cursor as number[];
    }
  }
  const h = Number(feature.properties?.render_height ?? 0);
  if (firstCoord) {
    return `mvt_${firstCoord[0].toFixed(6)}_${firstCoord[1].toFixed(6)}_${Math.round(h)}`;
  }
  return `mvt_unknown_${Math.round(h)}`;
}

/**
 * Calcola un numero casuale arrotondato a 1 decimale dentro l'intervallo [min, max].
 */
export function randomInRange(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const value = lo + Math.random() * (hi - lo);
  return Math.round(value * 10) / 10;
}

/**
 * Stima approssimativa dell'area in metri quadrati di un poligono [lon, lat]
 * usando proiezione locale equirettangolare sul baricentro.
 */
export function estimatePolygonAreaSqm(polygon: Polygon): number {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return 0;

  let avgLat = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    avgLat += ring[i][1];
  }
  avgLat /= ring.length - 1;

  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((avgLat * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * metersPerDegLon;
    const y1 = ring[i][1] * metersPerDegLat;
    const x2 = ring[i + 1][0] * metersPerDegLon;
    const y2 = ring[i + 1][1] * metersPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}
