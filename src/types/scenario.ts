import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { TreeType } from '@deck.gl-community/layers';

/**
 * Strumenti disponibili nella barra laterale dell'editor urbano 3D.
 */
export type ToolMode =
  | 'view'
  | 'add-building'
  | 'add-tree'
  | 'transform'
  | 'delete';

/**
 * Specie botaniche supportate da TreeLayer (@deck.gl-community/layers 9.4).
 */
export type TreeSpecies = TreeType;

export interface TreeSpeciesOption {
  value: TreeSpecies;
  label: string;
  defaultCrownRadius: number;
  defaultMinHeight: number;
  defaultMaxHeight: number;
}

/**
 * Catalogo completo delle 8 specie supportate con etichette in italiano
 * e proporzioni iniziali realistiche.
 */
export const TREE_SPECIES_OPTIONS: TreeSpeciesOption[] = [
  { value: 'oak', label: 'Quercia (Oak)', defaultCrownRadius: 4.0, defaultMinHeight: 7, defaultMaxHeight: 13 },
  { value: 'pine', label: 'Pino (Pine)', defaultCrownRadius: 2.8, defaultMinHeight: 8, defaultMaxHeight: 14 },
  { value: 'birch', label: 'Betulla (Birch)', defaultCrownRadius: 2.6, defaultMinHeight: 7, defaultMaxHeight: 12 },
  { value: 'cherry', label: 'Ciliegio (Cherry)', defaultCrownRadius: 3.0, defaultMinHeight: 6, defaultMaxHeight: 10 },
  { value: 'palm', label: 'Palma (Palm)', defaultCrownRadius: 3.2, defaultMinHeight: 7, defaultMaxHeight: 12 },
  { value: 'banyan', label: 'Baniano (Banyan)', defaultCrownRadius: 5.5, defaultMinHeight: 10, defaultMaxHeight: 16 },
  { value: 'mangrove', label: 'Mangrovia (Mangrove)', defaultCrownRadius: 3.4, defaultMinHeight: 6, defaultMaxHeight: 10 },
  { value: 'citrus', label: 'Agrume (Citrus)', defaultCrownRadius: 2.2, defaultMinHeight: 4, defaultMaxHeight: 7 },
];

/**
 * Tavolozza di colori architettonici predefiniti per i nuovi edifici.
 */
export const BUILDING_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: '#D97757', label: 'Terracotta' },
  { hex: '#E5DEC9', label: 'Travertino' },
  { hex: '#CBD5E1', label: 'Calcestruzzo' },
  { hex: '#64748B', label: 'Ardesia' },
  { hex: '#94A3B8', label: 'Vetro grigio' },
  { hex: '#C2A878', label: 'Arenaria' },
  { hex: '#5B8A72', label: 'Salvia' },
  { hex: '#3B82F6', label: 'Facciata blu' },
];

/**
 * Proprietà di un edificio aggiunto dall'utente nello scenario GeoJSON.
 */
export interface BuildingProperties {
  id: string;
  kind: 'building';
  /** Altezza dell'estrusione in metri (3–150 m, default 15 m). */
  height: number;
  /** Colore esadecimale della facciata/volume (es. "#D97757"). */
  color: string;
}

/**
 * Proprietà di un albero 3D aggiunto dall'utente nello scenario GeoJSON.
 */
export interface TreeProperties {
  id: string;
  kind: 'tree';
  /** Specie procedurale di TreeLayer. */
  species: TreeSpecies;
  /** Altezza totale in metri. */
  height: number;
  /** Raggio fisico della chioma in metri. */
  crownRadius: number;
}

export type BuildingFeature = Feature<Polygon, BuildingProperties>;
export type TreeFeature = Feature<Point, TreeProperties>;
export type ScenarioFeature = BuildingFeature | TreeFeature;

/** Type guard per restringere una feature dello scenario a BuildingFeature. */
export function isBuildingFeature(feature: ScenarioFeature): feature is BuildingFeature {
  return feature.properties.kind === 'building' && feature.geometry.type === 'Polygon';
}

/** Type guard per restringere una feature dello scenario a TreeFeature. */
export function isTreeFeature(feature: ScenarioFeature): feature is TreeFeature {
  return feature.properties.kind === 'tree' && feature.geometry.type === 'Point';
}

/**
 * Riferimento a un edificio esistente della città selezionato dall'utente
 * per modificarne l'altezza dal pannello proprietà.
 */
export interface SelectedExistingBuilding {
  id: string;
  originalHeight: number;
}

/**
 * Unico modello dati dello scenario:
 * una FeatureCollection GeoJSON con edifici (Polygon), alberi (Point)
 * e la mappa `existingBuildingHeights` con le altezze modificate degli edifici esistenti.
 */
export interface ScenarioCollection
  extends FeatureCollection<Polygon | Point, BuildingProperties | TreeProperties> {
  type: 'FeatureCollection';
  features: ScenarioFeature[];
  /** Mappa ID edificio OpenFreeMap -> nuova altezza totale in metri (3–150 m). */
  existingBuildingHeights: Record<string, number>;
}

/**
 * Albero esistente caricato da OpenStreetMap tramite Overpass API.
 * Resta separato dallo scenario modificabile dall'utente.
 */
export interface OsmTreeRecord {
  id: string;
  position: [number, number];
  height: number;
  species: TreeSpecies;
  crownRadius: number;
}

/**
 * Impostazioni predefinite per la creazione di nuovi alberi con lo strumento "Aggiungi albero".
 */
export interface TreeCreationDefaults {
  species: TreeSpecies;
  minHeight: number;
  maxHeight: number;
  crownRadius: number;
}

/**
 * Impostazioni predefinite per la creazione di nuovi edifici con lo strumento "Aggiungi palazzo".
 */
export interface BuildingCreationDefaults {
  height: number;
  color: string;
}

/**
 * Stato iniziale vuoto dello scenario.
 */
export const EMPTY_SCENARIO: ScenarioCollection = {
  type: 'FeatureCollection',
  features: [],
  existingBuildingHeights: {},
};

/**
 * Stili cartografici 2D supportati (100% gratuiti, senza API key) per OpenFreeMap 2D e texture sul terreno 3D.
 */
export type BasemapStyleId = 'bright' | 'satellite' | 'positron';

export interface BasemapStyleOption {
  id: BasemapStyleId;
  label: string;
}

export const BASEMAP_STYLE_OPTIONS: BasemapStyleOption[] = [
  { id: 'bright', label: 'Stradario' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'positron', label: 'Chiaro' },
];

/**
 * Inquadrature rapide predefinite (centro città piano e località collinari/alpine per testare i rilievi 3D).
 */
export interface CameraPreset {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'milano',
    label: 'Milano',
    longitude: 9.1900,
    latitude: 45.4642,
    zoom: 16,
    pitch: 55,
    bearing: -18,
  },
  {
    id: 'bergamo',
    label: 'Bergamo Alta',
    longitude: 9.6626,
    latitude: 45.7042,
    zoom: 15.2,
    pitch: 58,
    bearing: -25,
  },
  {
    id: 'como',
    label: 'Lago di Como',
    longitude: 9.0852,
    latitude: 45.8105,
    zoom: 14.3,
    pitch: 60,
    bearing: 28,
  },
];

/**
 * Vista iniziale: centro storico di Milano (Piazza del Duomo / Galleria / Scala),
 * zoom 16, pitch 55°.
 */
export const INITIAL_VIEW_STATE = {
  longitude: 9.1900,
  latitude: 45.4642,
  zoom: 16,
  pitch: 55,
  bearing: -18,
  maxPitch: 75,
  minZoom: 10,
  maxZoom: 20,
};

