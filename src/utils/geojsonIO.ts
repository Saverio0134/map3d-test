import type { Point, Polygon } from 'geojson';
import {
  isBuildingFeature,
  TREE_SPECIES_OPTIONS,
  type BuildingFeature,
  type ScenarioCollection,
  type ScenarioFeature,
  type TreeFeature,
  type TreeSpecies,
} from '../types/scenario';
import { ensureCounterClockwisePolygon, generateFeatureId } from './geometry';

const VALID_SPECIES = new Set<string>(TREE_SPECIES_OPTIONS.map((opt) => opt.value));

/**
 * Serializza l'intero scenario (palazzi, alberi e altezze modificate degli edifici esistenti)
 * in un file GeoJSON formattato e avvia il download nel browser.
 */
export function exportScenarioToGeoJson(scenario: ScenarioCollection): void {
  const payload: ScenarioCollection = {
    type: 'FeatureCollection',
    features: scenario.features.map((feature): ScenarioFeature => {
      if (isBuildingFeature(feature)) {
        return {
          ...feature,
          geometry: ensureCounterClockwisePolygon(feature.geometry),
        };
      }
      return feature;
    }),
    existingBuildingHeights: { ...scenario.existingBuildingHeights },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/geo+json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.href = url;
  link.download = `scenario-urbano-${timestamp}.geojson`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Valida e normalizza un documento GeoJSON importato dall'utente.
 * Preserva fedelmente palazzi, alberi e la mappa `existingBuildingHeights`,
 * garantendo che i poligoni abbiano l'anello esterno antiorario.
 */
export function parseScenarioGeoJson(rawText: string): ScenarioCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Il file selezionato non è un JSON valido.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Struttura GeoJSON non valida.');
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.type !== 'FeatureCollection' || !Array.isArray(candidate.features)) {
    throw new Error('Il file deve essere una FeatureCollection GeoJSON.');
  }

  const normalizedFeatures: ScenarioFeature[] = [];

  for (const rawFeature of candidate.features) {
    if (!rawFeature || typeof rawFeature !== 'object') continue;
    const f = rawFeature as Record<string, unknown>;
    const geometry = f.geometry as Record<string, unknown> | undefined;
    const props = (f.properties && typeof f.properties === 'object'
      ? (f.properties as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    if (!geometry || typeof geometry.type !== 'string') continue;

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      const heightRaw = Number(props.height);
      const height = Number.isFinite(heightRaw) ? Math.min(150, Math.max(3, heightRaw)) : 15;
      const color =
        typeof props.color === 'string' && props.color.startsWith('#')
          ? props.color
          : '#D97757';
      const id =
        typeof props.id === 'string' && props.id.trim().length > 0
          ? props.id
          : generateFeatureId('building');

      const building: BuildingFeature = {
        type: 'Feature',
        geometry: ensureCounterClockwisePolygon(geometry as unknown as Polygon),
        properties: {
          id,
          kind: 'building',
          height,
          color,
        },
      };
      normalizedFeatures.push(building);
    } else if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
      const coords = geometry.coordinates as number[];
      if (coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        continue;
      }
      const rawSpecies = typeof props.species === 'string' ? props.species : 'oak';
      const species: TreeSpecies = VALID_SPECIES.has(rawSpecies)
        ? (rawSpecies as TreeSpecies)
        : 'oak';
      const heightRaw = Number(props.height);
      const height = Number.isFinite(heightRaw) ? Math.min(40, Math.max(2, heightRaw)) : 8;
      const crownRaw = Number(props.crownRadius);
      const crownRadius = Number.isFinite(crownRaw)
        ? Math.min(15, Math.max(0.8, crownRaw))
        : 3.2;
      const id =
        typeof props.id === 'string' && props.id.trim().length > 0
          ? props.id
          : generateFeatureId('tree');

      const tree: TreeFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords[0], coords[1]],
        } as Point,
        properties: {
          id,
          kind: 'tree',
          species,
          height,
          crownRadius,
        },
      };
      normalizedFeatures.push(tree);
    }
  }

  const existingBuildingHeights: Record<string, number> = {};
  if (candidate.existingBuildingHeights && typeof candidate.existingBuildingHeights === 'object') {
    for (const [id, rawVal] of Object.entries(
      candidate.existingBuildingHeights as Record<string, unknown>
    )) {
      const h = Number(rawVal);
      if (id && Number.isFinite(h)) {
        existingBuildingHeights[id] = Math.min(150, Math.max(3, Math.round(h)));
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: normalizedFeatures,
    existingBuildingHeights,
  };
}
