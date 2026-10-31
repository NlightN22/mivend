import { ConsistencyClientError } from '../../../consistency/consistency-client-error';
import { parseSummary } from '../../../consistency/consistency-parse';
import type { ConsistencySourceClient } from '../../../consistency/consistency-source.client';
import type {
    ConsistencyIssue,
    ConsistencyIssuePage,
    ConsistencySourceConfig,
} from '../../../consistency/consistency-types';

export const CONFIG: ConsistencySourceConfig = {
    source: 'search-service',
    baseUrl: 'https://provider.example.invalid/',
    apiKey: 'synthetic-key',
    checkIntervalMs: 15 * 60_000,
};

// Synthetic provider payloads (wire shape of the provider OpenAPI file), never captured from a real provider.
export function wireIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'stock-mismatch',
        severity: 'warning',
        entityType: 'stock',
        entityId: 'erp-product-1',
        scope: { warehouseId: 'warehouse-a' },
        expected: { quantity: 5, availableQuantity: 5, available: true },
        actual: { quantity: 0, availableQuantity: null, available: false },
        firstDetectedAt: '2026-10-30T10:00:00.000Z',
        lastDetectedAt: '2026-10-30T11:00:00.000Z',
        resolvedAt: null,
        status: 'open',
        occurrences: 1,
        details: 'synthetic',
        replayable: true,
        ...overrides,
    };
}

export function wireSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        generatedAt: '2026-10-30T12:00:00.000Z',
        lastCheck: {
            startedAt: '2026-10-30T11:50:00.000Z',
            finishedAt: '2026-10-30T11:55:00.000Z',
            status: 'ok',
            durationMs: 300000,
            mode: 'incremental',
            checkedEntities: 10,
        },
        streams: [
            { stream: 'stock', lastAppliedEventAt: '2026-10-30T11:59:00.000Z', lagSeconds: 0 },
        ],
        openByType: { 'stock-mismatch': 1 },
        openBySeverity: { info: 0, warning: 1, critical: 0 },
        ...overrides,
    };
}

export function issue(
    id: string,
    lastDetectedAt: string,
    overrides: Partial<ConsistencyIssue> = {},
): ConsistencyIssue {
    return {
        providerIssueId: id,
        type: 'stock-mismatch',
        severity: 'warning',
        entityType: 'stock',
        entityId: `entity-${id}`,
        scope: {},
        expected: { quantity: 1 },
        actual: { quantity: 2 },
        details: 'synthetic',
        replayable: false,
        occurrences: 1,
        firstDetectedAt: '2026-10-30T10:00:00.000Z',
        lastDetectedAt,
        resolvedAt: null,
        status: 'open',
        ...overrides,
    };
}

export function freshSummary() {
    const now = new Date().toISOString();
    return parseSummary(
        wireSummary({
            lastCheck: {
                startedAt: now,
                finishedAt: now,
                status: 'ok',
                durationMs: 1,
                mode: 'full',
                checkedEntities: 1,
            },
        }),
    );
}

export function scriptedClient(steps: Array<ConsistencyIssuePage | ConsistencyClientError>) {
    const queue = [...steps];
    return {
        getSummary: async () => freshSummary(),
        getIssuesPage: async () => {
            const next = queue.shift();
            if (next instanceof ConsistencyClientError) throw next;
            if (!next) throw new Error('script exhausted');
            return next;
        },
    } as unknown as ConsistencySourceClient;
}
