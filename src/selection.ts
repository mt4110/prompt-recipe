export type SelectionState = { focused: string; checked: string[]; previewSet: boolean };
export type SelectionAction =
  | { type: "focus"; id: string }
  | { type: "checked"; update: string[] | ((current: string[]) => string[]) }
  | { type: "preview"; set: boolean };
export const createSelectionState = (focused: string): SelectionState => ({ focused, checked: [], previewSet: false });
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "focus": return { ...state, focused: action.id, previewSet: false };
    case "checked": return { ...state, checked: typeof action.update === "function" ? action.update(state.checked) : action.update };
    case "preview": return { ...state, previewSet: action.set };
  }
}
export function reorderSelection(ids: string[], id: string, direction: -1 | 1): string[] {
  const i=ids.indexOf(id), target=i+direction;
  if (i<0 || target<0 || target>=ids.length) return ids;
  const next=[...ids]; [next[i], next[target]]=[next[target], next[i]]; return next;
}
export const previewIds = (state: SelectionState): string[] => state.previewSet ? state.checked : state.focused ? [state.focused] : [];
