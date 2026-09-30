import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UnitStreamHandler } from '../../handlers/unit.handler';

function makeConnection(
    existing: Record<string, unknown> | null,
    variantRows: Array<{ id: string }> = [],
): {
    connection: {
        getRepository: ReturnType<typeof vi.fn>;
        rawConnection: { createQueryBuilder: ReturnType<typeof vi.fn> };
    };
    repo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    getRawMany: ReturnType<typeof vi.fn>;
} {
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    };
    const getRawMany = vi.fn().mockResolvedValue(variantRows);
    const queryBuilder = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawMany,
    };
    return {
        connection: {
            getRepository: vi.fn().mockReturnValue(repo),
            rawConnection: { createQueryBuilder: vi.fn().mockReturnValue(queryBuilder) },
        },
        repo,
        getRawMany,
    };
}

describe('UnitStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when code or name is missing', async () => {
        const { connection, repo } = makeConnection(null);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', { code: '', name: 'Box' });

        expect(repo.save).not.toHaveBeenCalled();
        expect(productVariantService.update).not.toHaveBeenCalled();
    });

    it('creates a new UnitRecord with explicit-zero handling for ratioToBase', async () => {
        const { connection, repo } = makeConnection(null);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', { code: 'BOX', name: 'Box' });

        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'unit-1',
                ownerId: null,
                code: 'BOX',
                name: 'Box',
                ratioToBase: 0,
                weightKg: null,
                volumeL: null,
                isDeleted: false,
            }),
        );
        expect(repo.save).toHaveBeenCalled();
    });

    it('stores real weight/volume/owner when present, and updates an existing row in place', async () => {
        const existing = { id: '1', entityId: 'unit-1', code: 'OLD', name: 'Old' };
        const { connection, repo } = makeConnection(existing);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', {
            code: 'BOX',
            name: 'Box',
            ownerId: 'product-1',
            ratioToBase: 12,
            weightKg: 5.5,
            volumeL: 3.2,
        });

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'unit-1',
                ownerId: 'product-1',
                ratioToBase: 12,
                weightKg: 5.5,
                volumeL: 3.2,
            }),
        );
    });

    it('marks isDeleted without removing the row (never destructive on a soft signal)', async () => {
        const existing = { id: '1', entityId: 'unit-1', code: 'BOX', name: 'Box' };
        const { connection, repo } = makeConnection(existing);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', { code: 'BOX', name: 'Box', isDeleted: true });

        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));
    });

    // Audit finding (mivend#103): a unit-changed arriving after its product must still refresh
    // that product's already-imported variant(s), not just wait for the next ProductChanged.
    it('refreshes every variant whose defaultSalesUnitId points at this unit', async () => {
        const { connection, getRawMany } = makeConnection(null, [
            { id: 'variant-1' },
            { id: 'variant-2' },
        ]);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', {
            code: 'BOX',
            name: 'Box',
            ratioToBase: 4,
            weightKg: 16.8,
            volumeL: 18.5,
        });

        expect(getRawMany).toHaveBeenCalled();
        expect(productVariantService.update).toHaveBeenCalledWith(ctx, [
            {
                id: 'variant-1',
                customFields: { unitRatioToBase: 4, unitWeightKg: 16.8, unitVolumeL: 18.5 },
            },
            {
                id: 'variant-2',
                customFields: { unitRatioToBase: 4, unitWeightKg: 16.8, unitVolumeL: 18.5 },
            },
        ]);
    });

    it('does not call productVariantService.update when no variant references this unit', async () => {
        const { connection } = makeConnection(null, []);
        const productVariantService = { update: vi.fn() };
        const handler = new UnitStreamHandler(connection as never, productVariantService as never);

        await handler.apply(ctx, 'unit-1', { code: 'BOX', name: 'Box' });

        expect(productVariantService.update).not.toHaveBeenCalled();
    });
});
