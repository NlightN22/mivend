// Keys follow <table-name>:<administratorId>; delete only this admin's, not localStorage.clear().
// Kept in this app, not ui-kit: its public barrel re-exports Vue SFCs, which break vitest's Node env.
export function clearPersonalUiState(administratorId: string): void {
    if (typeof localStorage === 'undefined' || !administratorId) return;
    const suffix = `:${administratorId}`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.endsWith(suffix)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
}
