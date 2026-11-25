import { GeoJsonLayer, MVTLayer, type Color } from 'deck.gl';
import type { Feature, Polygon, Position } from 'geojson';
import type { SelectedExistingBuilding, ToolMode } from '../types/scenario';
import { getExistingBuildingId } from '../utils/geometry';
import { SHARED_TERRAIN_EXTENSION } from './basemapTerrainLayer';

/** Endpoint TileJSON pubblico di OpenFreeMap (schema OpenMapTiles, senza chiave API). */
const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

/** Altezza di ripiego in metri se un edificio OpenMapTiles non espone `render_height`. */
const FALLBACK_BUILDING_HEIGHT = 10;

interface TileIndex {
  x: number;
  y: number;
  z: number;
}

interface ExistingBuildingsLayerOptions {
  /** Mappa ID edificio esistente -> nuova altezza totale in metri (3–150 m). */
  existingBuildingHeights: Record<string, number>;
  /** ID dell'edificio esistente attualmente selezionato per la modifica altezza. */
  selectedBuildingId: string | null;
  /** Strumento attivo nell'editor. */
  activeTool: ToolMode;
  /** Se true, aggancia la base di ogni edificio alla superficie del terreno 3D. */
  showTerrain3D: boolean;
  /** Callback chiamata quando l'utente seleziona un edificio esistente in modalità Vista. */
  onSelectBuilding?: (building: SelectedExistingBuilding) => void;
}

/**
 * Solleva gli anelli di un poligono alla quota base `minHeight` (in metri)
 * per gestire corpi sospesi o parti superiori di edifici (`render_min_height > 0`).
 */
function liftPolygonRings(rings: Position[][], minHeight: number): Position[][] {
  if (!minHeight || minHeight <= 0) return rings;
  return rings.map((ring) => ring.map((coord) => [coord[0], coord[1], minHeight]));
}

/**
 * Calcola il baricentro (media dei vertici dell'anello esterno) di un singolo poligono
 * e lo converte in coordinate geografiche WGS84 `[lon, lat]`.
 *
 * Usando la formula inversa Web Mercator direttamente sull'indice `{ x, y, z }` della tile,
 * eventuali metà di uno stesso edificio presenti nei buffer di due tile adiacenti
 * producono la stessa coordinata geografica.
 */
function computePolygonWgs84Centroid(
  outerRing: Position[],
  tileIndex?: TileIndex
): [number, number] | null {
  if (!outerRing || outerRing.length < 3) return null;

  const first = outerRing[0];
  const last = outerRing[outerRing.length - 1];
  const isClosed =
    outerRing.length > 3 && first[0] === last[0] && first[1] === last[1];
  const vertexCount = isClosed ? outerRing.length - 1 : outerRing.length;
  if (vertexCount <= 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < vertexCount; i++) {
    sumX += outerRing[i][0];
    sumY += outerRing[i][1];
  }
  const cx = sumX / vertexCount;
  const cy = sumY / vertexCount;

  // Se le coordinate sono in spazio locale tile [0..1] (con piccolo margine buffer),
  // le proietta esattamente in lon/lat tramite l'indice della tile Web Mercator.
  if (
    tileIndex &&
    Math.abs(cx) <= 2 &&
    Math.abs(cy) <= 2
  ) {
    const n = Math.pow(2, tileIndex.z);
    const lon = ((tileIndex.x + cx) / n) * 360 - 180;
    const latRad = Math.atan(
      Math.sinh(Math.PI * (1 - (2 * (tileIndex.y + cy)) / n))
    );
    const lat = (latRad * 180) / Math.PI;
    return [lon, lat];
  }

  return [cx, cy];
}

/**
 * Esplode le feature MVT scaricate per una tile in singoli edifici `Polygon`.
 *
 * Perché è indispensabile:
 * OpenFreeMap (Planetiler) fonde tutti gli edifici di una tile con la stessa altezza
 * e colore in un unico enorme `MultiPolygon` (anche oltre 1.000 edifici insieme).
 * Esplodere i `MultiPolygon` direttamente in `getTileData`:
 * 1. assegna a ogni singolo edificio un `__buildingId` univoco e deterministico;
 * 2. mantiene allineati al 100% gli indici tra `tile.content` (usato da `MVTLayer`
 *    per l'hover `highlightedObjectIndex`) e i dati passati a `GeoJsonLayer`;
 * 3. preserva intatti eventuali cortili interni (fori nei poligoni).
 */
function explodeTileBuildings(
  rawData: unknown,
  tileIndex?: TileIndex
): Feature<Polygon>[] {
  if (!Array.isArray(rawData)) return [];

  const prepared: Feature<Polygon>[] = [];
  const seenIdsInTile = new Map<string, number>();

  for (const item of rawData) {
    const feature = item as Feature;
    if (!feature || !feature.geometry) continue;

    const props = (feature.properties ?? {}) as Record<string, unknown>;
    // OpenMapTiles imposta `hide_3d: true` sull'ingombro base quando esistono parti 3D dettagliate
    if (props.hide_3d === true) continue;

    let polygonList: Position[][][];
    if (feature.geometry.type === 'Polygon') {
      polygonList = [feature.geometry.coordinates];
    } else if (feature.geometry.type === 'MultiPolygon') {
      polygonList = feature.geometry.coordinates;
    } else {
      continue;
    }

    const rawHeight = Number(
      props.render_height ?? props.height ?? FALLBACK_BUILDING_HEIGHT
    );
    const originalHeight =
      Number.isFinite(rawHeight) && rawHeight > 0
        ? Math.round(rawHeight)
        : FALLBACK_BUILDING_HEIGHT;

    const rawMinHeight = Number(props.render_min_height ?? props.min_height ?? 0);
    const minHeight =
      Number.isFinite(rawMinHeight) && rawMinHeight > 0
        ? Math.min(rawMinHeight, Math.max(0, originalHeight - 1))
        : 0;

    for (const polygonRings of polygonList) {
      const outerRing = polygonRings[0];
      if (!outerRing || outerRing.length < 3) continue;

      const centroid = computePolygonWgs84Centroid(outerRing, tileIndex);
      const baseId = centroid
        ? `bldg_${centroid[0].toFixed(6)}_${centroid[1].toFixed(6)}_${Math.round(minHeight)}_${originalHeight}`
        : `bldg_fallback_${prepared.length}_${originalHeight}`;

      // Garantisce che due edifici distinti nella stessa tile non condividano mai lo stesso ID
      const seenCount = seenIdsInTile.get(baseId) ?? 0;
      seenIdsInTile.set(baseId, seenCount + 1);
      const buildingId = seenCount === 0 ? baseId : `${baseId}_${seenCount + 1}`;

      prepared.push({
        type: 'Feature',
        id: buildingId,
        geometry: {
          type: 'Polygon',
          coordinates: liftPolygonRings(polygonRings, minHeight),
        },
        properties: {
          ...props,
          __buildingId: buildingId,
          __originalHeight: originalHeight,
          __minHeight: minHeight,
        },
      });
    }
  }

  return prepared;
}

/**
 * Sottoclasse di `MVTLayer` che esplode i `MultiPolygon` di OpenFreeMap in singoli
 * edifici `Polygon` subito al caricamento della tile (`getTileData`).
 * In questo modo `tile.content`, picking, `autoHighlight` e `uniqueIdProperty`
 * lavorano sempre sul singolo edificio senza mai coinvolgere edifici vicini.
 */
class ExplodedBuildingMVTLayer extends MVTLayer {
  static layerName = 'ExplodedBuildingMVTLayer';

  async getTileData(
    loadProps: Parameters<MVTLayer['getTileData']>[0]
  ): Promise<Feature<Polygon>[]> {
    const rawData = await super.getTileData(loadProps);
    return explodeTileBuildings(rawData, loadProps.index as TileIndex | undefined);
  }
}

/**
 * Crea una firma sintetica della mappa delle altezze modificate per gli `updateTriggers`.
 */
function buildHeightsSignature(heights: Record<string, number>): string {
  const entries = Object.entries(heights);
  if (entries.length === 0) return '';
  return entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, h]) => `${id}:${h}`)
    .join('|');
}

/**
 * Crea il layer MVT 3D degli edifici esistenti della città da OpenFreeMap.
 * - Esplode i MultiPolygon della tile così ogni edificio è indipendente per hover, selezione e altezza.
 * - Estrude ogni edificio in metri reali da `render_height` / `render_min_height`.
 * - Applica in tempo reale eventuali modifiche di altezza salvate in `existingBuildingHeights`.
 */
export function createExistingBuildingsLayer({
  existingBuildingHeights,
  selectedBuildingId,
  activeTool,
  showTerrain3D,
  onSelectBuilding,
}: ExistingBuildingsLayerOptions): MVTLayer {
  const heightsSignature = buildHeightsSignature(existingBuildingHeights);
  const canSelectExisting = activeTool === 'view';

  return new ExplodedBuildingMVTLayer({
    id: 'existing-city-buildings-mvt',
    data: OPENFREEMAP_TILEJSON_URL,
    minZoom: 13,
    maxZoom: 14,
    // Disabilita la modalità binaria per esplodere i MultiPolygon in GeoJSON singoli
    binary: false,
    // Identifica univocamente ogni singolo edificio per l'autoHighlight di MVTLayer
    uniqueIdProperty: '__buildingId',
    extensions: showTerrain3D ? [SHARED_TERRAIN_EXTENSION] : [],
    ...(showTerrain3D ? { terrainDrawMode: 'offset' as const } : {}),
    loadOptions: {
      mvt: {
        layers: ['building'],
      },
    },
    pickable: true,
    autoHighlight: canSelectExisting,
    highlightColor: [37, 99, 235, 95],
    updateTriggers: {
      renderSubLayers: [heightsSignature, selectedBuildingId, canSelectExisting, showTerrain3D],
    },
    renderSubLayers: (subLayerProps) => {
      // MVTLayer gestisce l'hover tramite `highlightedObjectIndex` calcolato sul proprio
      // `tile.content` (già esploso in singoli edifici). Se non siamo in modalità Vista
      // forziamo -1 così da azzerare subito eventuali evidenziazioni residue.
      const highlightedObjectIndex = canSelectExisting
        ? (subLayerProps as { highlightedObjectIndex?: number }).highlightedObjectIndex
        : -1;

      return new GeoJsonLayer({
        ...subLayerProps,
        id: `${subLayerProps.id}-buildings-3d`,
        highlightedObjectIndex,
        extruded: true,
        elevationScale: 1,
        wireframe: false,
        stroked: false,
        filled: true,
        pickable: true,
        material: {
          ambient: 0.52,
          diffuse: 0.68,
          shininess: 12,
          specularColor: [30, 30, 30],
        },
        getFillColor: (f: Feature): Color => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const id = String(props.__buildingId ?? '');
          if (selectedBuildingId && id === selectedBuildingId) {
            // Edificio esistente selezionato: blu architettonico ben distinguibile
            return [96, 145, 224, 255];
          }
          if (id in existingBuildingHeights) {
            // Edificio esistente con altezza modificata: grigio-ardesia leggermente caldo
            return [184, 198, 218, 255];
          }
          return [212, 217, 226, 255];
        },
        getElevation: (f: Feature) => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const id = String(props.__buildingId ?? '');
          const originalHeight = Number(
            props.__originalHeight ?? FALLBACK_BUILDING_HEIGHT
          );
          const minHeight = Number(props.__minHeight ?? 0);
          const targetHeight =
            id in existingBuildingHeights
              ? existingBuildingHeights[id]
              : originalHeight;
          return Math.max(1, targetHeight - minHeight);
        },
        updateTriggers: {
          getFillColor: [heightsSignature, selectedBuildingId],
          getElevation: [heightsSignature],
        },
      });
    },
    onClick: (info) => {
      if (!canSelectExisting || !onSelectBuilding || !info.object) return false;
      const feature = info.object as Feature;
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const id =
        typeof props.__buildingId === 'string'
          ? props.__buildingId
          : getExistingBuildingId(feature);
      const originalHeight = Number(
        props.__originalHeight ?? props.render_height ?? FALLBACK_BUILDING_HEIGHT
      );
      onSelectBuilding({
        id,
        originalHeight: Number.isFinite(originalHeight)
          ? Math.min(150, Math.max(3, Math.round(originalHeight)))
          : FALLBACK_BUILDING_HEIGHT,
      });
      return true;
    },
  });
}

