import { describe, expect, it, vi } from 'vitest';
import type { Order, RequestContext } from '@vendure/core';

import { OrderOrganizationsResolver } from '../../order-organizations.resolver';

function build(orgIds: Array<string | undefined>, names: Record<string, string>) {
    const query = vi
        .fn()
        .mockResolvedValue(
            Object.entries(names).map(([erpId, legalName]) => ({ erpId, legalName })),
        );
    const resolver = new OrderOrganizationsResolver({
        getRepository: () => ({
            find: async () => orgIds.map(id => ({ customFields: { organizationId: id } })),
        }),
        rawConnection: { query },
    } as never);
    return { resolver, query };
}

const ctx = {} as RequestContext;
const order = { id: 1 } as unknown as Order;

describe('OrderOrganizationsResolver', () => {
    it('returns distinct legal names in line order', async () => {
        const { resolver } = build(['b', 'a', 'b'], { a: 'Org A', b: 'Org B' });
        expect(await resolver.organizations(ctx, order)).toEqual(['Org B', 'Org A']);
    });

    it('skips lines without an organization and unknown ids', async () => {
        const { resolver } = build([undefined, 'a', 'x'], { a: 'Org A' });
        expect(await resolver.organizations(ctx, order)).toEqual(['Org A']);
    });

    it('does not query names when no line has an organization', async () => {
        const { resolver, query } = build([undefined], {});
        expect(await resolver.organizations(ctx, order)).toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });
});
