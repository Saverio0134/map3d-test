# Urbano 3D — Editor Urbano 3D con deck.gl

Prototipo web di editor urbano 3D realizzato con **Vite + TypeScript + React**, **deck.gl 9.4**, **`@deck.gl-community/editable-layers` 9.4**, **`@deck.gl-community/layers` 9.4 (`TreeLayer`)** e **MapLibre GL (`react-map-gl/maplibre`)** senza alcuna chiave API.

## Avvio rapido

```bash
npm install
npm run dev
```

L'applicazione si apre su una vista 3D del centro storico di Milano (zoom `16`, pitch `55°`) con mappa base 2D (Stradario / Satellite / Chiaro), rilievi 3D del terreno (AWS Terrarium DEM) ed edifici esistenti 3D da OpenFreeMap.

## Modello dati dello scenario

Tutta la scena modificabile dall'utente è rappresentata da un'unica `FeatureCollection` GeoJSON (`ScenarioCollection` in `src/types/scenario.ts`):

- **Palazzo aggiunto**: `Feature<Polygon>` con `properties: { id, kind: "building", height, color }`
- **Albero aggiunto**: `Feature<Point>` con `properties: { id, kind: "tree", species, height, crownRadius }`
- **Altezze edifici esistenti modificate**: mappa `existingBuildingHeights: Record<string, number>` a livello radice della `FeatureCollection` (membro esteso RFC 7946) che salva la nuova altezza in metri per gli edifici OpenFreeMap modificati, preservandola tra esportazione e importazione GeoJSON.

Tutti i layer 3D leggono esclusivamente da questi dati: ogni modifica alla scena avviene aggiornando lo stato dello scenario.

## Struttura dei file

```text
src/
├── App.tsx                             # Stato centrale dello scenario, selezione, scorciatoie e coordinamento UI
├── main.tsx                            # Entry point React + import CSS MapLibre
├── index.css                           # Stili globali Tailwind v4 e slider
├── types/
│   └── scenario.ts                     # Modello dati GeoJSON, catalogo specie TreeLayer, basemap e viste rapide
├── layers/
│   ├── lighting.ts                     # LightingEffect (luce ambientale + luce solare direzionale)
│   ├── basemapTerrainLayer.ts          # Basemap 2D (TileLayer+BitmapLayer) e rilievi 3D del terreno (TerrainLayer)
│   ├── existingBuildingsLayer.ts       # MVTLayer 3D edifici esistenti OpenFreeMap con modifica altezza live
│   ├── osmTreesLayer.ts                # TreeLayer 3D alberi esistenti da Overpass / OSM API
│   ├── userBuildingsLayer.ts           # PolygonLayer 3D estruso per i palazzi aggiunti dall'utente
│   ├── userTreesLayer.ts               # TreeLayer 3D per gli alberi aggiunti dall'utente
│   ├── surfaceTemperatureLayer.ts      # Layer tematico Temperatura al suolo (mappa termica reattiva)
│   └── editableScenarioLayer.ts        # EditableGeoJsonLayer 2D attivo solo durante disegno/modifica
├── tools/
│   ├── toolDefinitions.ts              # Metadati, scorciatoie (1-5) e guide contestuali dei 5 strumenti
│   ├── viewTool.ts                     # Strumento 1: Vista e selezione elementi aggiunti
│   ├── addBuildingTool.ts              # Strumento 2: Aggiungi palazzo (DrawPolygonMode + vertici antiorari)
│   ├── addTreeTool.ts                  # Strumento 3: Aggiungi albero (DrawPointMode + altezza casuale)
│   ├── transformTool.ts                # Strumento 4: Sposta / Ruota / Scala (TransformMode)
│   ├── deleteTool.ts                   # Strumento 5: Elimina palazzo o albero aggiunto
│   └── editExistingBuildingTool.ts     # Gestione modifica e ripristino altezza degli edifici esistenti
├── utils/
│   ├── geometry.ts                     # Correzione ordine vertici antiorario (CCW), colori RGBA e ID MVT
│   ├── overpass.ts                     # Query Overpass API + fallback OSM API v0.6 per node["natural"="tree"]
│   ├── terrainElevation.ts             # Campionatore altimetrico AWS Terrarium DEM per posizionare gli alberi 3D
│   └── geojsonIO.ts                    # Esportazione e importazione validata dello scenario GeoJSON
└── components/
    ├── UrbanMapEditor.tsx              # Contenitore principale DeckGL (controller) + MapLibre come figlio
    ├── Toolbar.tsx                     # Barra laterale sinistra con strumenti, basemap/terreno 3D e Temperatura
    └── PropertiesPanel.tsx             # Pannello destro proprietà edificio/albero/esistente + import/export GeoJSON
```

## Quale layer fa cosa

| Layer | File | Libreria | Ruolo nella scena |
| :--- | :--- | :--- | :--- |
| **`terrain-3d-relief` / `basemap-2d-*`** | `src/layers/basemapTerrainLayer.ts` | `TerrainLayer` / `TileLayer` + `BitmapLayer` (`deck.gl`) + OpenFreeMap (`MapLibre`) | In modalità piana 2D mostra la basemap vettoriale OpenFreeMap (`bright` / `positron`, 100% gratuita senza API key) o ortofoto Satellite Esri; con i rilievi 3D attivi genera la mesh altimetrica reale da AWS Terrarium DEM (`operation: 'terrain+draw'`) con texture gratuita (Esri Topo, Satellite, Chiaro) fornendo la superficie 3D a tutti gli altri layer. |
| **`existing-city-buildings-mvt`** | `src/layers/existingBuildingsLayer.ts` | `MVTLayer` (`deck.gl`) | Carica le tile vettoriali OpenFreeMap (`building`, schema OpenMapTiles), esplode i `MultiPolygon` in singoli edifici, li estrude da `render_height` / `render_min_height`, li appoggia sul terreno 3D (`_TerrainExtension`) e applica in tempo reale le altezze salvate in `existingBuildingHeights`. |
| **`existing-osm-trees-3d`** | `src/layers/osmTreesLayer.ts` | `TreeLayer` (`@deck.gl-community/layers`) | Disegna in 3D gli alberi esistenti scaricati da Overpass / OpenStreetMap API (`node["natural"="tree"]`, max 2000 risultati), appoggiati alla quota del terreno 3D. |
| **`user-scenario-buildings-3d`** | `src/layers/userBuildingsLayer.ts` | `PolygonLayer` (`deck.gl`) | Estrude in 3D (`extruded: true`) tutti i poligoni dello scenario con `kind: "building"`, applicando altezza (`3–150 m`), colore, contorno di selezione e aggancio al terreno 3D. |
| **`user-scenario-trees-3d`** | `src/layers/userTreesLayer.ts` | `TreeLayer` (`@deck.gl-community/layers`) | Renderizza in 3D tutti i punti dello scenario con `kind: "tree"` usando specie (`pine`, `oak`, `palm`, `birch`, `cherry`, `banyan`, `mangrove`, `citrus`), altezza, raggio chioma e quota del terreno 3D. |
| **`thematic-surface-temperature`** | `src/layers/surfaceTemperatureLayer.ts` | `PolygonLayer` (`deck.gl`) | Mappa termica al suolo semitrasparente (`26–41 °C`), drappeggiata sui rilievi 3D, che risponde al raffrescamento degli alberi e al calore dei nuovi edifici. |
| **`editable-scenario-2d`** | `src/layers/editableScenarioLayer.ts` | `EditableGeoJsonLayer` (`@deck.gl-community/editable-layers`) | Attivo **solo** con gli strumenti *Aggiungi palazzo* (`DrawPolygonMode`), *Aggiungi albero* (`DrawPointMode`) e *Sposta/Ruota* (`TransformMode`). Mostra sagome 2D e maniglie sopra la scena 3D; fuori dalla modalità di modifica viene smontato lasciando visibili solo i layer 3D. |
