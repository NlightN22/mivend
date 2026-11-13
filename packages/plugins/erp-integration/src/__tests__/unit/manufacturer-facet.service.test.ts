import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ManufacturerFacetService } from '../../manufacturer-facet.service';

vi.mock('@vendure/core', () => ({
    Logger: { error: vi.fn() },
    Facet: class {},
    FacetService: class {},
    FacetValueService: class {},
    ProcessContext: class {},
    RequestContextService: class {},
    TransactionalConnection: class {},
    VendureEntity: class {},
}));

const ctx = {} as RequestContext;

function setup(
    values: Array<{ id: number; code: string; name: string }>,
    isServer = true,
    manufacturers: Array<{ id?: number; externalId: string; name: string }> = [
        { externalId: 'm-1', name: 'A' },
    ],
) {
    const facet = { id: 1 };
    const facetService = { findByCode: vi.fn().mockResolvedValue(facet), create: vi.fn() };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(values),
        create: vi.fn().mockResolvedValue({ id: 99 }),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const find = vi.fn(async (options: { where: { id: { value: number } }; take: number }) =>
        manufacturers.filter(m => (m.id ?? 1) > options.where.id.value).slice(0, options.take),
    );
    const connection = { getRepository: () => ({ find }) };
    const service = new ManufacturerFacetService(
        facetService as never,
        facetValueService as never,
        connection as never,
        { create: async () => ctx } as never,
        { isServer } as never,
    );
    return { service, facetValueService, find };
}

describe('ManufacturerFacetService', () => {
    it('creates a missing facet value', async () => {
        const { service, facetValueService } = setup([]);
        await service.ensureValue(ctx, 'm-1', 'A');
        expect(facetValueService.create).toHaveBeenCalledTimes(1);
    });

    it('is idempotent for an existing value with the same name', async () => {
        const { service, facetValueService } = setup([{ id: 5, code: 'm-1', name: 'A' }]);
        await service.ensureValue(ctx, 'm-1', 'A');
        expect(facetValueService.create).not.toHaveBeenCalled();
        expect(facetValueService.update).not.toHaveBeenCalled();
    });

    it('renames an existing value when a real name arrives', async () => {
        const { service, facetValueService } = setup([{ id: 5, code: 'm-1', name: 'm-1' }]);
        await service.ensureValue(ctx, 'm-1', 'A');
        expect(facetValueService.update).toHaveBeenCalledTimes(1);
    });

    it('loads the facet values once for many different manufacturers', async () => {
        const { service, facetValueService } = setup([{ id: 5, code: 'm-1', name: 'A' }]);
        await service.ensureValue(ctx, 'm-1', 'A');
        await service.ensureValue(ctx, 'm-1', 'A');
        await service.ensureValue(ctx, 'm-1', null);
        expect(facetValueService.findByFacetId).toHaveBeenCalledTimes(1);
    });

    it('still syncs when the same manufacturer arrives with a new name', async () => {
        const { service, facetValueService } = setup([{ id: 5, code: 'm-1', name: 'A' }]);
        await service.ensureValue(ctx, 'm-1', 'A');
        await service.ensureValue(ctx, 'm-1', 'B');
        expect(facetValueService.findByFacetId).toHaveBeenCalledTimes(1);
        expect(facetValueService.update).toHaveBeenCalledTimes(1);
    });

    it('backfills existing manufacturers on the server process only', async () => {
        const server = setup([]);
        await server.service.onApplicationBootstrap();
        expect(server.facetValueService.create).toHaveBeenCalledTimes(1);

        const worker = setup([], false);
        await worker.service.onApplicationBootstrap();
        expect(worker.facetValueService.create).not.toHaveBeenCalled();
    });

    it('backfill loads the existing values once, not once per manufacturer', async () => {
        const manufacturers = [1, 2, 3].map(i => ({ externalId: `m-${i}`, name: `N${i}` }));
        const existing = [{ id: 1, code: 'm-1', name: 'N1' }];
        const { service, facetValueService } = setup(existing, true, manufacturers);
        await service.onApplicationBootstrap();
        expect(facetValueService.findByFacetId).toHaveBeenCalledTimes(1);
        expect(facetValueService.create).toHaveBeenCalledTimes(2);
    });

    it('backfill reads manufacturers in keyset chunks of 1000', async () => {
        const manufacturers = Array.from({ length: 2500 }, (_, i) => ({
            id: i + 1,
            externalId: `m-${i + 1}`,
            name: `N${i + 1}`,
        }));
        const { service, facetValueService, find } = setup([], true, manufacturers);
        await service.onApplicationBootstrap();
        expect(find).toHaveBeenCalledTimes(3);
        expect(find.mock.calls.map(([o]) => o.take)).toEqual([1000, 1000, 1000]);
        expect(facetValueService.create).toHaveBeenCalledTimes(2500);
    });
});
