import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReconciliationDiffClient } from '../../reconciliation-diff.client';
import { resolveTheirCount } from '../../reconciliation-decision';
import { CUSTOMER_ORDER_COUNT_CONDITION, filterFor } from '../../reconciliation-filters';
import { COMPARED_AGGREGATE_TYPES } from '../../reconciliation-local-counts.service';
import { ROW_COUNT_RULES } from '../../reconciliation-row-counts';
import { ReconciliationSummaryClient } from '../../reconciliation-summary.client';

afterEach(() => vi.unstubAllGlobals());

async function requestedUrl(aggregateType: string): Promise<URL> {
    const fetchMock = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    await new ReconciliationSummaryClient({
        reconciliationApiUrl: 'https://is.example',
    } as never).fetchSummaries(aggregateType);
    return new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
}

describe('aggregate filters', () => {
    it('customer orders are compared by the not-deleted predicate on both sides', async () => {
        expect(COMPARED_AGGREGATE_TYPES).toContain('customer-order');
        expect(ROW_COUNT_RULES['customer-order'].condition).toBe(CUSTOMER_ORDER_COUNT_CONDITION);
        expect(CUSTOMER_ORDER_COUNT_CONDITION).toContain(
            '"customFieldsErpmarkedfordeletion" IS NOT TRUE',
        );
        expect((await requestedUrl('customer-order')).searchParams.get('excludeDeleted')).toBe(
            'true',
        );
    });

    it('stock keeps its deleted-warehouse parameter, other aggregates send none', async () => {
        expect((await requestedUrl('stock')).searchParams.get('excludeDeletedWarehouse')).toBe(
            'true',
        );
        expect([...(await requestedUrl('unit')).searchParams.keys()]).toEqual(['aggregateType']);
    });

    it('compares the count of orders, not the posted figure', () => {
        expect(filterFor('customer-order').theirFigure).toBe('count');
        const summary = {
            aggregateType: 'customer-order',
            count: 90,
            activeCount: 80,
            lastModifiedMax: null,
        };
        expect(resolveTheirCount(summary)).toBe(90);
        expect(resolveTheirCount({ ...summary, aggregateType: 'unit' })).toBe(80);
        expect(resolveTheirCount({ ...summary, aggregateType: 'storageLocation' })).toBe(90);
    });
});

describe('diff request filter', () => {
    it('sends excludeDeleted for orders only', async () => {
        const fetchMock = vi.fn(async () => new Response('{"items":[]}'));
        vi.stubGlobal('fetch', fetchMock);
        const client = new ReconciliationDiffClient({
            reconciliationApiUrl: 'https://is.example',
            resyncSourceSystem: 's',
        } as never);
        await client.missingIds('customer-order', [], {}, 10);
        await client.missingIds('unit', [], {}, 10);
        const bodies = fetchMock.mock.calls.map(c =>
            JSON.parse(String((c as unknown as [URL, RequestInit])[1].body)),
        );
        expect(bodies[0].excludeDeleted).toBe(true);
        expect(bodies[1].excludeDeleted).toBeUndefined();
    });
});
