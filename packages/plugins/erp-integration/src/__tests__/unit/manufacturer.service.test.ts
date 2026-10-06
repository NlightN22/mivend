import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ManufacturerService } from '../../manufacturer.service';

const ctx = {} as RequestContext;

function setup(existing: { externalId: string; name: string | null } | null) {
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((v: object) => v),
        save: vi.fn(async (v: object) => v),
    };
    const connection = { getRepository: () => repo };
    const facet = { ensureValue: vi.fn().mockResolvedValue(undefined) };
    const service = new ManufacturerService(connection as never, facet as never);
    return { repo, facet, service };
}

describe('ManufacturerService.upsert facet mirroring', () => {
    it('creates the manufacturer and its facet value', async () => {
        const { service, facet } = setup(null);
        await service.upsert(ctx, 'mfr-1', 'Brand A');
        expect(facet.ensureValue).toHaveBeenCalledWith(ctx, 'mfr-1', 'Brand A');
    });

    it('heals a missing facet value for an existing manufacturer without a new name', async () => {
        const { service, facet, repo } = setup({ externalId: 'mfr-1', name: 'Brand A' });
        await service.upsert(ctx, 'mfr-1', undefined);
        expect(repo.save).not.toHaveBeenCalled();
        expect(facet.ensureValue).toHaveBeenCalledWith(ctx, 'mfr-1', 'Brand A');
    });

    it('passes the backfilled name through', async () => {
        const { service, facet } = setup({ externalId: 'mfr-1', name: null });
        await service.upsert(ctx, 'mfr-1', 'Brand A');
        expect(facet.ensureValue).toHaveBeenCalledWith(ctx, 'mfr-1', 'Brand A');
    });
});

describe('ManufacturerService.ensureReference', () => {
    it('creates a nameless manufacturer without touching the facet', async () => {
        const { service, facet, repo } = setup(null);
        await service.ensureReference(ctx, 'mfr-1');
        expect(repo.save).toHaveBeenCalledWith({ externalId: 'mfr-1', name: null });
        expect(facet.ensureValue).not.toHaveBeenCalled();
    });

    it('returns an existing manufacturer untouched', async () => {
        const existing = { externalId: 'mfr-1', name: 'Brand A' };
        const { service, facet, repo } = setup(existing);
        expect(await service.ensureReference(ctx, 'mfr-1')).toBe(existing);
        expect(repo.save).not.toHaveBeenCalled();
        expect(facet.ensureValue).not.toHaveBeenCalled();
    });
});
