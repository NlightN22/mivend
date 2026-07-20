// Every per-admin, per-table UI preference persisted to localStorage in this app (column order/
// width/visibility/sort/pageSize/filters — see @mivend/ui-kit's useDataTableState.ts/
// useColumnVisibility.ts) uses the same storage-key convention: `<table-name>:<administratorId>`.
// This sweeps and removes every key for one administrator, regardless of which table/component
// wrote it — called on logout (see stores/auth.ts) so a stale personal preference from an earlier
// session never silently resurfaces for whoever logs in next. Real incident: a stale
// `pageSize`/`filters` value from earlier testing desynced from the page's own fresh-mount state
// and produced a genuinely confusing pagination bug (wrong rows shown for a given page) that no
// in-app reconciliation fully anticipated. Scoped to this one administrator's keys, not a blanket
// `localStorage.clear()` — a shared/kiosk browser can have other administrators' saved
// preferences that logging out shouldn't wipe.
//
// Lives in this app, not @mivend/ui-kit, deliberately: the `<table-name>:<administratorId>`
// convention is defined by this app's own consumers of useDataTableState/useColumnVisibility, and
// importing ui-kit's public barrel (which re-exports every Vue SFC in the package) from a plain
// store module breaks it under the root `vitest.config.ts`'s plain Node unit-test environment
// (no Vue SFC plugin registered there) — real incident found live while adding this function.
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
