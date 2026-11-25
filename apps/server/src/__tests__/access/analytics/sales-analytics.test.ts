import { describe, expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import { counterpartyErpId, counterpartyName, type ActorKey } from '../seed/fixture-plan';

const QUERY = `query($input: SalesAnalyticsInput!) {
  salesAnalytics(input: $input) {
    state limitedToVisibleCustomers correctionsWithoutEffect unresolvedCurrencies
    rows { dimensionId }
  }
}`;
const LIST = `query { counterparties(options: { take: 100 }) { items { erpId } } }`;

interface Asked {
    counterpartyIds: string[];
    contractIds: string[];
    mainManagerOnly: boolean;
    dimension: string;
}

// The analytics double answers with one row carrying what the server asked for.
async function asked(
    actor: ActorKey | 'superadmin',
    over: Record<string, unknown> = {},
): Promise<{ state: string; request: Asked | null }> {
    const result = await admin<{
        salesAnalytics: { state: string; rows: Array<{ dimensionId: string }> };
    }>(await staffToken(actor), QUERY, {
        input: {
            from: '2026-01-01T00:00:00Z',
            to: '2026-02-01T00:00:00Z',
            granularity: 'NONE',
            dimension: 'COUNTERPARTY',
            ...over,
        },
    });
    expect(result.errors ?? []).toEqual([]);
    const { state, rows } = result.data!.salesAnalytics;
    return { state, request: rows[0] ? (JSON.parse(rows[0].dimensionId) as Asked) : null };
}

async function visibleErpIds(actor: ActorKey): Promise<string[]> {
    const result = await admin<{ counterparties: { items: Array<{ erpId: string }> } }>(
        await staffToken(actor),
        LIST,
    );
    return result.data!.counterparties.items.map(i => i.erpId).sort();
}

describe('salesAnalytics scope', () => {
    it.each<ActorKey>(['manager-a', 'manager-b', 'head-a', 'head-b'])(
        '%s asks the analytics service only for the customers they can see',
        async actor => {
            const { state, request } = await asked(actor);

            expect(state).toBe('OK');
            expect([...request!.counterpartyIds].sort()).toEqual(await visibleErpIds(actor));
        },
    );

    it.each<ActorKey | 'superadmin'>(['director', 'superadmin'])(
        '%s is not restricted to a customer list',
        async actor => {
            expect((await asked(actor)).request!.counterpartyIds).toEqual([]);
        },
    );

    it('is denied to a role without the analytics right', async () => {
        const result = await admin(await staffToken('operator-a'), QUERY, {
            input: {
                from: '2026-01-01T00:00:00Z',
                to: '2026-02-01T00:00:00Z',
                granularity: 'NONE',
                dimension: 'NONE',
            },
        });

        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
        expect(result.data?.salesAnalytics ?? null).toBeNull();
    });
});

describe('salesAnalytics name filters', () => {
    it('resolves a typed customer name to its ERP id inside the scope', async () => {
        const { request } = await asked('manager-a', {
            entityFilters: [{ kind: 'CUSTOMER', values: [counterpartyName('a-own')] }],
        });

        expect(request!.counterpartyIds).toEqual([counterpartyErpId('a-own')]);
    });

    it('returns no rows, not an unfiltered answer, for a customer the viewer cannot see', async () => {
        const result = await asked('manager-a', {
            entityFilters: [{ kind: 'CUSTOMER', values: [counterpartyName('b-own')] }],
        });

        expect(result).toEqual({ state: 'OK', request: null });
    });

    it('returns no rows for a contract name that matches nothing', async () => {
        const result = await asked('superadmin', {
            entityFilters: [{ kind: 'CONTRACT', values: ['no such contract anywhere'] }],
        });

        expect(result.request).toBeNull();
    });

    it('sends the main-manager switch and the customer manager dimension to the service', async () => {
        const { request } = await asked('superadmin', {
            dimension: 'COUNTERPARTY_MANAGER',
            mainManagerOnly: true,
        });

        expect(request).toMatchObject({
            dimension: 'SALES_DIMENSION_COUNTERPARTY_MANAGER',
            mainManagerOnly: true,
        });
    });

    it('refuses a filter kind that sales do not have', async () => {
        const result = await admin(await staffToken('superadmin'), QUERY, {
            input: {
                from: '2026-01-01T00:00:00Z',
                to: '2026-02-01T00:00:00Z',
                granularity: 'NONE',
                dimension: 'NONE',
                entityFilters: [{ kind: 'PRODUCT', values: ['x'] }],
            },
        });

        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
    });
});
