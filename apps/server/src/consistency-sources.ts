import type { ConsistencySourceConfig } from '@mivend/plugin-erp-integration';

const CHECK_INTERVAL_DEFAULT_MS = 6 * 60 * 60_000;

// Disabled unless explicitly enabled; a missing URL or key disables it as well, never a half-configured poll.
export function consistencySourcesFromEnv(env: NodeJS.ProcessEnv): ConsistencySourceConfig[] {
    const baseUrl = env.CONSISTENCY_SEARCH_SERVICE_URL || env.SEARCH_SERVICE_URL;
    const apiKey = env.CONSISTENCY_SEARCH_SERVICE_API_KEY;
    if (env.CONSISTENCY_SEARCH_SERVICE_ENABLED !== 'true' || !baseUrl || !apiKey) return [];
    return [
        {
            source: 'search-service',
            baseUrl,
            apiKey,
            checkIntervalMs:
                Number(env.CONSISTENCY_SEARCH_SERVICE_CHECK_INTERVAL_MS) ||
                CHECK_INTERVAL_DEFAULT_MS,
        },
    ];
}
