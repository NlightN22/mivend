import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';

import { EntityVersionScopeRegistry } from '../../entity-version-scope.registry';

const ctx = {} as RequestContext;

function registry(kind: 'own' | 'all'): EntityVersionScopeRegistry {
    const scope = {
        resolveCounterpartyScope: async () => ({ kind }),
    } as unknown as AccessScopeService;
    const r = new EntityVersionScopeRegistry(scope);
    r.register('Counterparty', async (_c, ids) => new Set(ids.filter(id => id === '1')));
    return r;
}

const refs = [
    { entityName: 'Counterparty', entityId: '1' },
    { entityName: 'Counterparty', entityId: 2 },
    { entityName: 'Counterparty', entityId: 'unknown' },
    { entityName: 'Mystery', entityId: '7' },
];

describe('EntityVersionScopeRegistry.filterRefs', () => {
    it('keeps in-scope refs and drops out-of-scope and unknown ids', async () => {
        const out = await registry('own').filterRefs(ctx, refs.slice(0, 3));
        expect(out).toEqual([refs[0]]);
    });

    it('denies an entity name without a rule for a non-all scope', async () => {
        expect(await registry('own').filterRefs(ctx, [refs[3]])).toEqual([]);
    });

    it('allows an entity name without a rule for scope all, but still applies registered rules', async () => {
        const out = await registry('all').filterRefs(ctx, refs);
        expect(out).toEqual([refs[0], refs[3]]);
    });
});
