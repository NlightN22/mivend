import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { EntityVersionScopeRegistry, EntityVisibilityFilter } from '@mivend/plugin-versioning';

import { EntityVersionScopeRegistrar } from '../../entity-version-scope.registrar';
import type { CounterpartyService } from '../../counterparty.service';
import type { TradingPointService } from '../../trading-point.service';

interface Setup {
    filters: Record<string, EntityVisibilityFilter>;
    ctx: RequestContext;
}

function setup(manages = false): Setup {
    const filters: Record<string, EntityVisibilityFilter> = {};
    const registry = {
        register: (name: string, f: EntityVisibilityFilter) => (filters[name] = f),
    } as unknown as EntityVersionScopeRegistry;
    const counterparties = {
        findOneVisible: vi.fn(async (_c: unknown, id: string) => (id === 'c1' ? { id } : null)),
    } as unknown as CounterpartyService;
    const points = {
        findById: vi.fn(async (_c: unknown, id: string) =>
            id === 'p1' ? { counterpartyId: 'c1' } : id === 'p2' ? { counterpartyId: 'c2' } : null,
        ),
    } as unknown as TradingPointService;
    new EntityVersionScopeRegistrar(registry, counterparties, points).onApplicationBootstrap();
    const ctx = { userHasPermissions: () => manages } as unknown as RequestContext;
    return { filters, ctx };
}

describe('EntityVersionScopeRegistrar', () => {
    it('counterparty history follows findOneVisible', async () => {
        const s = setup();
        expect([...(await s.filters.Counterparty(s.ctx, ['c1', 'c2', 'nope']))]).toEqual(['c1']);
    });

    it('trading point history follows the owning counterparty scope', async () => {
        const s = setup();
        expect([...(await s.filters.TradingPoint(s.ctx, ['p1', 'p2', 'nope']))]).toEqual(['p1']);
    });

    it('visibility grant history needs a grant-managing permission', async () => {
        expect((await setup().filters.VisibilityGrant(setup().ctx, ['g1'])).size).toBe(0);
        const s = setup(true);
        expect([...(await s.filters.VisibilityGrant(s.ctx, ['g1']))]).toEqual(['g1']);
    });
});
