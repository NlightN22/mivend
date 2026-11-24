import { describe, expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import { counterpartyErpId, counterpartyName, type ActorKey } from '../seed/fixture-plan';

const QUERY = `query($input: OrderAnalyticsInput!) {
  orderAnalytics(input: $input) { state limitedToVisibleCustomers rows { dimensionId } }
}`;
const SUGGEST = `query($kind: OrderAnalyticsFilterKind!, $prefix: String!) {
  orderAnalyticsSuggest(kind: $kind, prefix: $prefix)
}`;
const LIST = `query { counterparties(options: { take: 100 }) { items { erpId } } }`;

interface Asked {
    customerIds: string[];
    productIds: string[];
    manufacturerIds: string[];
    mainManagerOnly: boolean;
    dimension: string;
}

// The analytics double answers with one row carrying what the server asked for.
async function asked(
    actor: ActorKey | 'superadmin',
    over: Record<string, unknown> = {},
): Promise<{ state: string; request: Asked | null }> {
    const result = await admin<{
        orderAnalytics: { state: string; rows: Array<{ dimensionId: string }> };
    }>(await staffToken(actor), QUERY, {
        input: {
            from: '2026-01-01T00:00:00Z',
            to: '2026-02-01T00:00:00Z',
            granularity: 'NONE',
            dimension: 'CUSTOMER',
            ...over,
        },
    });
    expect(result.errors ?? []).toEqual([]);
    const { state, rows } = result.data!.orderAnalytics;
    return { state, request: rows[0] ? (JSON.parse(rows[0].dimensionId) as Asked) : null };
}

async function visibleErpIds(actor: ActorKey): Promise<string[]> {
    const result = await admin<{ counterparties: { items: Array<{ erpId: string }> } }>(
        await staffToken(actor),
        LIST,
    );
    return result.data!.counterparties.items.map(i => i.erpId).sort();
}

describe('orderAnalytics scope', () => {
    it.each<ActorKey>(['manager-a', 'manager-b', 'head-a', 'head-b'])(
        '%s asks the analytics service only for the customers they can see',
        async actor => {
            const { state, request } = await asked(actor);

            expect(state).toBe('OK');
            expect([...request!.customerIds].sort()).toEqual(await visibleErpIds(actor));
        },
    );

    it.each<ActorKey | 'superadmin'>(['director', 'superadmin'])(
        '%s is not restricted to a customer list',
        async actor => {
            expect((await asked(actor)).request!.customerIds).toEqual([]);
        },
    );

    it('keeps a customer of another manager out of the request', async () => {
        const { request } = await asked('manager-a');

        expect(request!.customerIds).toContain(counterpartyErpId('a-own'));
        expect(request!.customerIds).not.toContain(counterpartyErpId('b-own'));
    });

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
        expect(result.data?.orderAnalytics ?? null).toBeNull();
    });
});

describe('orderAnalytics name filters', () => {
    it('resolves a typed customer name to its ERP id inside the scope', async () => {
        const { request } = await asked('manager-a', {
            entityFilters: [{ kind: 'CUSTOMER', values: [counterpartyName('a-own')] }],
        });

        expect(request!.customerIds).toEqual([counterpartyErpId('a-own')]);
    });

    it('returns no rows, not an unfiltered answer, for a customer the viewer cannot see', async () => {
        const result = await asked('manager-a', {
            entityFilters: [{ kind: 'CUSTOMER', values: [counterpartyName('b-own')] }],
        });

        expect(result).toEqual({ state: 'OK', request: null });
    });

    it('returns no rows for a product or manufacturer name that matches nothing', async () => {
        for (const kind of ['PRODUCT', 'MANUFACTURER']) {
            const result = await asked('superadmin', {
                entityFilters: [{ kind, values: ['no such name anywhere'] }],
            });
            expect(result.request, kind).toBeNull();
        }
    });

    it('sends the main-manager switch and the customer manager dimension to the service', async () => {
        const { request } = await asked('superadmin', {
            dimension: 'COUNTERPARTY_MANAGER',
            mainManagerOnly: true,
        });

        expect(request).toMatchObject({
            dimension: 'DIMENSION_COUNTERPARTY_MANAGER',
            mainManagerOnly: true,
        });
    });
});

describe('orderAnalyticsSuggest scope', () => {
    const suggest = async (actor: ActorKey, prefix: string): Promise<string[]> => {
        const result = await admin<{ orderAnalyticsSuggest: string[] }>(
            await staffToken(actor),
            SUGGEST,
            { kind: 'CUSTOMER', prefix },
        );
        expect(result.errors ?? []).toEqual([]);
        return result.data!.orderAnalyticsSuggest;
    };

    it('suggests only customers the viewer can see', async () => {
        const names = await suggest('manager-a', 'Access client');

        expect(names).toContain(counterpartyName('a-own'));
        expect(names).not.toContain(counterpartyName('b-own'));
    });

    it('suggests nothing for a prefix shorter than two characters', async () => {
        expect(await suggest('manager-a', 'A')).toEqual([]);
    });

    it('is denied to a role without the analytics right', async () => {
        const result = await admin(await staffToken('operator-a'), SUGGEST, {
            kind: 'CUSTOMER',
            prefix: 'Access client',
        });

        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
    });
});
