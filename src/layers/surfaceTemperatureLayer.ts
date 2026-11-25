import { PolygonLayer, type Color } from 'deck.gl';
import type {
  BuildingFeature,
  OsmTreeRecord,
  TreeFeature,
} from '../types/scenario';
import { estimatePolygonAreaSqm } from '../utils/geometry';
import { SHARED_TERRAIN_EXTENSION } from './basemapTerrainLayer';

/** Intervallo termico visualizzato dalla scala cromatica (°C, giorno estivo urbano). */
export const TEMP_MIN_C = 26;
export const TEMP_MAX_C = 41;

interface SurfaceTemperatureCell {
  polygon: [number, number, number][];
  tempC: number;
}

interface SurfaceTemperatureLayerOptions {
  /** Attiva o disattiva la mappa di temperatura al suolo. */
  visible: boolean;
  /** Centro geografico su cui ancorare la griglia termica (ri-ancorato a scatti per fluidità). */
  anchorCenter: [number, number];
  /** Palazzi aggiunti dall'utente (aumentano localmente la massa termica / calore). */
  userBuildings: BuildingFeature[];
  /** Alberi aggiunti dall'utente (generano isole locali di raffrescamento proporzionali alla chioma). */
  userTrees: TreeFeature[];
  /** Alberi esistenti caricati da OSM (contribuiscono al raffrescamento al suolo). */
  osmTrees: OsmTreeRecord[];
  /** Se true, drappeggia la mappa termica sulla superficie del terreno 3D. */
  showTerrain3D: boolean;
}

/**
 * Scala cromatica termica continua (blu fresco -> ciano -> verde -> giallo -> arancione -> rosso)
 * semitrasparente per mantenere leggibile la cartografia sottostante.
 */
function temperatureToRgba(tempC: number): Color {
  const t = Math.max(0, Math.min(1, (tempC - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C)));

  const stops: [number, [number, number, number]][] = [
    [0.0, [37, 99, 235]],   // 26 °C — Blu fresco
    [0.25, [14, 165, 233]], // ~29.8 °C — Ciano
    [0.45, [132, 204, 22]], // ~32.8 °C — Verde-giallo
    [0.65, [250, 204, 21]], // ~35.8 °C — Giallo caldo
    [0.82, [249, 115, 22]], // ~38.3 °C — Arancione intenso
    [1.0, [220, 38, 38]],   // 41 °C — Rosso picco termico
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
        145,
      ];
    }
  }
  return [220, 38, 38, 155];
}

/**
 * Calcola il baricentro approssimativo [lon, lat] di un poligono edificio.
 */
function getBuildingCentroid(building: BuildingFeature): [number, number] {
  const ring = building.geometry.coordinates[0];
  if (!ring || ring.length === 0) return [0, 0];
  const count = Math.max(1, ring.length - 1);
  let sumLon = 0;
  let sumLat = 0;
  for (let i = 0; i < count; i++) {
    sumLon += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLon / count, sumLat / count];
}

/**
 * Genera una griglia regolare al suolo (~18 m per cella, copertura ~780 m × 780 m)
 * con stima visuale della temperatura superficiale urbana:
 * - base microclimatica di isola di calore urbana;
 * - raffrescamento locale sotto e attorno agli alberi utente e agli alberi OSM;
 * - riscaldamento locale attorno ai nuovi volumi edificati dall'utente.
 */
function buildTemperatureGrid(
  anchorCenter: [number, number],
  userBuildings: BuildingFeature[],
  userTrees: TreeFeature[],
  osmTrees: OsmTreeRecord[]
): SurfaceTemperatureCell[] {
  const [centerLon, centerLat] = anchorCenter;
  const gridHalfCount = 21; // 43 × 43 = 1849 celle
  const cellSizeMeters = 18;

  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const dLat = cellSizeMeters / metersPerDegLat;
  const dLon = cellSizeMeters / metersPerDegLon;

  // Pre-estrae le sorgenti di raffrescamento (alberi utente + alberi OSM) in metri locali
  const coolingSources: { x: number; y: number; radiusM: number; deltaC: number }[] = [];

  for (const tree of userTrees) {
    const x = (tree.geometry.coordinates[0] - centerLon) * metersPerDegLon;
    const y = (tree.geometry.coordinates[1] - centerLat) * metersPerDegLat;
    const radiusM = Math.max(16, tree.properties.crownRadius * 3.4);
    const deltaC = Math.min(6.2, 2.2 + tree.properties.crownRadius * 0.35 + tree.properties.height * 0.06);
    coolingSources.push({ x, y, radiusM, deltaC });
  }

  for (const tree of osmTrees) {
    const x = (tree.position[0] - centerLon) * metersPerDegLon;
    const y = (tree.position[1] - centerLat) * metersPerDegLat;
    // Ignora alberi lontani dalla griglia corrente per mantenere alte le prestazioni
    if (Math.abs(x) > 520 || Math.abs(y) > 520) continue;
    const radiusM = Math.max(14, tree.crownRadius * 2.8);
    const deltaC = Math.min(4.5, 1.6 + tree.crownRadius * 0.28);
    coolingSources.push({ x, y, radiusM, deltaC });
  }

  // Pre-estrae le sorgenti di riscaldamento (edifici aggiunti dall'utente)
  const warmingSources = userBuildings.map((building) => {
    const [bLon, bLat] = getBuildingCentroid(building);
    const areaSqm = estimatePolygonAreaSqm(building.geometry);
    const equivRadius = Math.sqrt(Math.max(50, areaSqm) / Math.PI);
    return {
      x: (bLon - centerLon) * metersPerDegLon,
      y: (bLat - centerLat) * metersPerDegLat,
      radiusM: Math.max(22, equivRadius + 16),
      deltaC: Math.min(4.2, 1.4 + building.properties.height * 0.03),
    };
  });

  const cells: SurfaceTemperatureCell[] = [];
  const zOffset = 0.08; // Leggermente sopra la mappa base per evitare z-fighting

  for (let iy = -gridHalfCount; iy <= gridHalfCount; iy++) {
    const lat0 = centerLat + (iy - 0.5) * dLat;
    const lat1 = centerLat + (iy + 0.5) * dLat;
    const cellCenterLat = centerLat + iy * dLat;
    const cy = iy * cellSizeMeters;

    for (let ix = -gridHalfCount; ix <= gridHalfCount; ix++) {
      const lon0 = centerLon + (ix - 0.5) * dLon;
      const lon1 = centerLon + (ix + 0.5) * dLon;
      const cellCenterLon = centerLon + ix * dLon;
      const cx = ix * cellSizeMeters;

      // Campo termico urbano di base deterministico sulle coordinate reali (non cambia al pan)
      const wave1 = Math.sin(cellCenterLon * 920) * Math.cos(cellCenterLat * 780);
      const wave2 = Math.sin((cellCenterLon + cellCenterLat) * 1650) * 0.55;
      const wave3 = Math.cos((cellCenterLon - cellCenterLat) * 2800) * 0.35;
      let tempC = 34.8 + (wave1 + wave2 + wave3) * 1.65;

      // Contributo di raffrescamento degli alberi (kernel gaussiano morbido)
      let totalCooling = 0;
      for (let k = 0; k < coolingSources.length; k++) {
        const s = coolingSources[k];
        const dx = cx - s.x;
        const dy = cy - s.y;
        const distSq = dx * dx + dy * dy;
        const maxDist = s.radiusM * 2.2;
        if (distSq > maxDist * maxDist) continue;
        const sigmaSq = s.radiusM * s.radiusM;
        totalCooling += s.deltaC * Math.exp(-distSq / (2 * sigmaSq));
      }
      // Saturazione realistica del raffrescamento arboreo (fino a -7.5 °C in boschetti densi)
      tempC -= Math.min(7.5, totalCooling);

      // Contributo di riscaldamento degli edifici aggiunti
      let totalWarming = 0;
      for (let k = 0; k < warmingSources.length; k++) {
        const s = warmingSources[k];
        const dx = cx - s.x;
        const dy = cy - s.y;
        const distSq = dx * dx + dy * dy;
        const maxDist = s.radiusM * 2.0;
        if (distSq > maxDist * maxDist) continue;
        const sigmaSq = s.radiusM * s.radiusM;
        totalWarming += s.deltaC * Math.exp(-distSq / (2 * sigmaSq));
      }
      tempC += Math.min(5.0, totalWarming);

      cells.push({
        polygon: [
          [lon0, lat0, zOffset],
          [lon1, lat0, zOffset],
          [lon1, lat1, zOffset],
          [lon0, lat1, zOffset],
          [lon0, lat0, zOffset],
        ],
        tempC: Math.max(TEMP_MIN_C, Math.min(TEMP_MAX_C, tempC)),
      });
    }
  }

  return cells;
}

/**
 * Crea il layer tematico "Temperatura al suolo" (`PolygonLayer` 2D al suolo).
 * Mostra una mappa termica semitrasparente che reagisce in tempo reale agli alberi
 * (raffrescamento) e ai nuovi edifici (isola di calore) presenti nello scenario.
 */
export function createSurfaceTemperatureLayer({
  visible,
  anchorCenter,
  userBuildings,
  userTrees,
  osmTrees,
  showTerrain3D,
}: SurfaceTemperatureLayerOptions): PolygonLayer<SurfaceTemperatureCell> | null {
  if (!visible) return null;

  const cells = buildTemperatureGrid(anchorCenter, userBuildings, userTrees, osmTrees);

  return new PolygonLayer<SurfaceTemperatureCell>({
    id: 'thematic-surface-temperature',
    data: cells,
    extruded: false,
    filled: true,
    stroked: false,
    pickable: false,
    extensions: showTerrain3D ? [SHARED_TERRAIN_EXTENSION] : [],
    ...(showTerrain3D ? { terrainDrawMode: 'drape' as const } : {}),
    getPolygon: (cell) => cell.polygon,
    getFillColor: (cell) => temperatureToRgba(cell.tempC),
    updateTriggers: {
      getFillColor: [anchorCenter[0], anchorCenter[1], userBuildings, userTrees, osmTrees],
    },
  });
}
