import type { ToolMode } from '../types/scenario';

export interface ToolDefinition {
  id: ToolMode;
  label: string;
  shortcut: string;
  hint: string;
}

/**
 * Definizione dei 5 strumenti principali nella barra laterale dell'editor.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: 'view',
    label: 'Vista',
    shortcut: '1',
    hint: 'Trascina per navigare, tasto destro o Ctrl+trascina per ruotare. Clicca su un edificio esistente o su un elemento aggiunto per modificarlo.',
  },
  {
    id: 'add-building',
    label: 'Aggiungi palazzo',
    shortcut: '2',
    hint: 'Clicca sulla mappa per tracciare i vertici del perimetro 2D. Doppio clic o clic sul primo vertice per estrudere l’edificio 3D.',
  },
  {
    id: 'add-tree',
    label: 'Aggiungi albero',
    shortcut: '3',
    hint: 'Clicca in qualsiasi punto della mappa per piantare un albero 3D della specie scelta nel pannello laterale.',
  },
  {
    id: 'transform',
    label: 'Sposta / Ruota',
    shortcut: '4',
    hint: 'Clicca su un palazzo o un albero aggiunto per selezionarlo, poi trascina la sagoma o le maniglie di rotazione e scala.',
  },
  {
    id: 'delete',
    label: 'Elimina',
    shortcut: '5',
    hint: 'Clicca su un palazzo o un albero aggiunto allo scenario per rimuoverlo immediatamente.',
  },
];

export function getToolDefinition(tool: ToolMode): ToolDefinition {
  return TOOL_DEFINITIONS.find((item) => item.id === tool) ?? TOOL_DEFINITIONS[0];
}
