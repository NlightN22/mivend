const RELOAD_KEY = 'mv-stale-chunk-reload-at';
const RELOAD_GUARD_MS = 10_000;

// After a deploy the old hashed chunks are gone; one reload fetches the fresh index.html.
export function reloadOnStaleChunk(target: Window = window): void {
    target.addEventListener('vite:preloadError', event => {
        const last = Number(target.sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - last < RELOAD_GUARD_MS) return;
        target.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        event.preventDefault();
        target.location.reload();
    });
}
