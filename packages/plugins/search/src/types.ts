export const loggerCtx = 'SearchPlugin';

export type SearchBackend = 'internal' | 'external';

// Issue #69: per-contour deployment choice, read once at bootstrap — never an admin-configurable
// runtime toggle, never both backends active at once, no fallback. Defaults to 'internal' (kept
// as ElasticsearchPlugin) so any config site that forgets to set SEARCH_BACKEND fails safe onto
// today's unchanged behavior — same fail-safe-to-off convention as erp-integration's
// KAFKA_ENABLED_DEFAULT (see external-integration-rules skill).
export const SEARCH_BACKEND_DEFAULT: SearchBackend = 'internal';

export function getSearchBackend(): SearchBackend {
    const raw = process.env.SEARCH_BACKEND;
    if (raw === 'internal' || raw === 'external') return raw;
    if (raw !== undefined) {
        console.warn(
            `[${loggerCtx}] Unrecognized SEARCH_BACKEND="${raw}", falling back to "${SEARCH_BACKEND_DEFAULT}"`,
        );
    }
    return SEARCH_BACKEND_DEFAULT;
}
