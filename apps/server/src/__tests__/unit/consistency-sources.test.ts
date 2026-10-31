import { describe, expect, it } from 'vitest';
import { consistencySourcesFromEnv } from '../../consistency-sources';

const on = {
    CONSISTENCY_SEARCH_SERVICE_ENABLED: 'true',
    CONSISTENCY_SEARCH_SERVICE_URL: 'https://search.example.test',
    CONSISTENCY_SEARCH_SERVICE_API_KEY: 'key-1',
};

describe('consistencySourcesFromEnv', () => {
    it('returns no source unless explicitly enabled', () => {
        expect(
            consistencySourcesFromEnv({ ...on, CONSISTENCY_SEARCH_SERVICE_ENABLED: undefined }),
        ).toEqual([]);
    });

    it('returns no source when the key is missing', () => {
        expect(
            consistencySourcesFromEnv({ ...on, CONSISTENCY_SEARCH_SERVICE_API_KEY: undefined }),
        ).toEqual([]);
    });

    it('falls back to the search service URL and the 6 h interval', () => {
        const [source] = consistencySourcesFromEnv({
            ...on,
            CONSISTENCY_SEARCH_SERVICE_URL: undefined,
            SEARCH_SERVICE_URL: 'https://fallback.example.test',
        });
        expect(source).toMatchObject({
            baseUrl: 'https://fallback.example.test',
            checkIntervalMs: 21_600_000,
        });
    });

    it('takes an explicit interval', () => {
        const [source] = consistencySourcesFromEnv({
            ...on,
            CONSISTENCY_SEARCH_SERVICE_CHECK_INTERVAL_MS: '60000',
        });
        expect(source.checkIntervalMs).toBe(60000);
    });
});
