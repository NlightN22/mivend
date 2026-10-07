import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { SearchPriceTypeService } from '../../search-price-type.service';

const ctx = {} as RequestContext;

function make(opts: {
    codeByUser?: Record<string, string | null>;
    types: Array<{ id: string; code: string; externalId: string | null }>;
    defaultId?: string | null;
}) {
    const repo = {
        findOne: vi.fn(
            async ({ where }: { where: { code?: string; id?: string } }) =>
                opts.types.find(t => (where.code ? t.code === where.code : t.id === where.id)) ??
                null,
        ),
    };
    const priceEntry = {
        getPriceTypeCodeForUser: vi.fn(async (c: { user?: string }) =>
            c.user ? (opts.codeByUser?.[c.user] ?? null) : null,
        ),
    };
    const branch = {
        resolveEffective: vi.fn(async () =>
            opts.defaultId ? { defaultPriceTypeId: opts.defaultId } : null,
        ),
    };
    const service = new SearchPriceTypeService(
        priceEntry as never,
        branch as never,
        { getRepository: () => repo } as never,
    );
    return { service, branch };
}

const types = [
    { id: '1', code: 'wholesale', externalId: 'guid-wholesale' },
    { id: '2', code: 'retail', externalId: 'guid-retail' },
    { id: '3', code: 'seed', externalId: null },
];

describe('SearchPriceTypeService.resolveExternalId', () => {
    it('returns the customer type externalId', async () => {
        const { service, branch } = make({ codeByUser: { a: 'wholesale' }, types, defaultId: '2' });
        expect(await service.resolveExternalId({ user: 'a' } as never)).toBe('guid-wholesale');
        expect(branch.resolveEffective).not.toHaveBeenCalled();
    });

    it('isolates two customers', async () => {
        const { service } = make({ codeByUser: { a: 'wholesale', b: 'retail' }, types });
        expect(await service.resolveExternalId({ user: 'a' } as never)).toBe('guid-wholesale');
        expect(await service.resolveExternalId({ user: 'b' } as never)).toBe('guid-retail');
    });

    it('guest and customer without a type use the branch default', async () => {
        const { service } = make({ codeByUser: { a: null }, types, defaultId: '2' });
        expect(await service.resolveExternalId(ctx)).toBe('guid-retail');
        expect(await service.resolveExternalId({ user: 'a' } as never)).toBe('guid-retail');
    });

    it('falls back to the default when the customer type has no externalId', async () => {
        const { service } = make({ codeByUser: { a: 'seed' }, types, defaultId: '2' });
        expect(await service.resolveExternalId({ user: 'a' } as never)).toBe('guid-retail');
    });

    it('returns null when nothing resolves or the type has no externalId', async () => {
        expect(await make({ types }).service.resolveExternalId(ctx)).toBeNull();
        expect(await make({ types, defaultId: '3' }).service.resolveExternalId(ctx)).toBeNull();
    });
});
