import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { PriceTypeAccessService } from '../../price-type-access.service';

const rows = [
    { id: '1', code: 'retail', externalId: 'e1', visibility: 'customer' },
    { id: '2', code: 'wholesale', externalId: 'e2', visibility: 'customer' },
    { id: '3', code: 'purchase', externalId: 'e3', visibility: 'confidential' },
];

function make(opts: {
    permissions?: string[];
    branchId?: string | null;
    settings?: { defaultPriceTypeId: string; visiblePriceTypeIds?: string[] | null } | null;
}) {
    const ctx = {
        userHasPermissions: (p: string[]) => p.every(x => (opts.permissions ?? []).includes(x)),
    } as unknown as RequestContext;
    const query = vi.fn(async () => rows);
    const service = new PriceTypeAccessService(
        { getRepository: () => ({ find: query }) } as never,
        {
            getActorIdentity: vi.fn(async () => ({
                roleCodes: [],
                branchId: opts.branchId ?? null,
            })),
        } as never,
        { getForBranch: vi.fn(async () => opts.settings ?? null) } as never,
    );
    return { ctx, service, query };
}

describe('PriceTypeAccessService (deny by default)', () => {
    it('computes the access base once per request for N list calls', async () => {
        const { ctx, service, query } = make({
            branchId: 'branch-a',
            settings: { defaultPriceTypeId: '1', visiblePriceTypeIds: null },
        });
        for (let i = 0; i < 20; i++) {
            await service.isCodeAllowed(ctx, 'retail', { contextCodes: ['wholesale'] });
        }
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('does not share the memo between requests', async () => {
        const { ctx, service, query } = make({});
        await service.allowedCodes(ctx);
        await service.allowedCodes({ ...ctx } as RequestContext);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('grants nothing without a branch rule or a permission', async () => {
        const { ctx, service } = make({});
        expect(await service.allowedCodes(ctx)).toEqual([]);
    });

    it('grants the branch allow-list and the branch default, customer types only', async () => {
        const { ctx, service } = make({
            branchId: 'branch-a',
            settings: { defaultPriceTypeId: '1', visiblePriceTypeIds: ['2'] },
        });
        expect(await service.allowedCodes(ctx)).toEqual(['retail', 'wholesale']);
    });

    it('a null allow-list still includes only the branch default', async () => {
        const { ctx, service } = make({
            branchId: 'branch-a',
            settings: { defaultPriceTypeId: '1', visiblePriceTypeIds: null },
        });
        expect(await service.allowedCodes(ctx)).toEqual(['retail']);
    });

    it('never grants a confidential type through a branch rule', async () => {
        const { ctx, service } = make({
            branchId: 'branch-a',
            settings: { defaultPriceTypeId: '3', visiblePriceTypeIds: ['3'] },
        });
        expect(await service.allowedCodes(ctx)).toEqual([]);
    });

    it('two branches see different types', async () => {
        const a = make({ branchId: 'a', settings: { defaultPriceTypeId: '1' } });
        const b = make({ branchId: 'b', settings: { defaultPriceTypeId: '2' } });
        expect(await a.service.allowedCodes(a.ctx)).toEqual(['retail']);
        expect(await b.service.allowedCodes(b.ctx)).toEqual(['wholesale']);
    });

    it('an actor without a branch or settings gets no branch grant', async () => {
        expect(await make({ branchId: null }).service.allowedCodes(make({}).ctx)).toEqual([]);
        const noSettings = make({ branchId: 'a', settings: null });
        expect(await noSettings.service.allowedCodes(noSettings.ctx)).toEqual([]);
    });

    it('ReadAllCustomerPriceTypes grants every customer type but not confidential', async () => {
        const { ctx, service } = make({ permissions: ['ReadAllCustomerPriceTypes'] });
        expect(await service.allowedCodes(ctx)).toEqual(['retail', 'wholesale']);
    });

    it('ReadConfidentialPriceTypes alone grants only confidential types', async () => {
        const { ctx, service } = make({ permissions: ['ReadConfidentialPriceTypes'] });
        expect(await service.allowedCodes(ctx)).toEqual(['purchase']);
    });

    it('the union of both permissions sees everything', async () => {
        const { ctx, service } = make({
            permissions: ['ReadConfidentialPriceTypes', 'ReadAllCustomerPriceTypes'],
        });
        expect(await service.allowedCodes(ctx)).toEqual(['retail', 'wholesale', 'purchase']);
    });

    it('a customer-class context type is shown outside the branch list, a confidential one never', async () => {
        const { ctx, service } = make({
            branchId: 'a',
            settings: { defaultPriceTypeId: '1' },
        });
        expect(
            await service.allowedCodes(ctx, { contextCodes: ['wholesale', 'purchase'] }),
        ).toEqual(['retail', 'wholesale']);
    });

    it('assertCodeAllowed throws ForbiddenError for a hidden or unknown code', async () => {
        const { ctx, service } = make({ branchId: 'a', settings: { defaultPriceTypeId: '1' } });
        await expect(service.assertCodeAllowed(ctx, 'retail')).resolves.toBeUndefined();
        await expect(service.assertCodeAllowed(ctx, 'wholesale')).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        await expect(service.assertCodeAllowed(ctx, 'purchase')).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        await expect(service.assertCodeAllowed(ctx, 'nope')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('resolves allowed external ids and denies a missing one', async () => {
        const { ctx, service } = make({ branchId: 'a', settings: { defaultPriceTypeId: '1' } });
        expect(await service.isExternalIdAllowed(ctx, 'e1')).toBe(true);
        expect(await service.isExternalIdAllowed(ctx, 'e3')).toBe(false);
        expect(await service.isExternalIdAllowed(ctx, null)).toBe(false);
    });
});
