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
    manufacturers = [{ externalId: 'm-1', name: 'A' }],
) {
    const facet = { id: 1 };
    const facetService = { findByCode: vi.fn().mockResolvedValue(facet), create: vi.fn() };
    const facetValueService = {
        findByFacetId: vi.fn().mockResolvedValue(values),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const connection = { getRepository: () => ({ find: async () => manufacturers }) };
    const service = new ManufacturerFacetService(
        facetService as never,
        facetValueService as never,
        connection as never,
        { create: async () => ctx } as never,
        { isServer } as never,
    );
    return { service, facetValueService };
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
});
