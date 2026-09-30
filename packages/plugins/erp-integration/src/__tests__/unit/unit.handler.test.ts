import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { UnitStreamHandler } from '../../handlers/unit.handler';

function makeConnection(
    existing: Record<string, unknown> | null,
    affected = 0,
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
    updateQueryBuilder: {
        update: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
        andWhere: ReturnType<typeof vi.fn>;
        execute: ReturnType<typeof vi.fn>;
    };
} {
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    };
    const updateQueryBuilder = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected }),
    };
    return {
        connection: {
            getRepository: vi.fn().mockReturnValue(repo),
            rawConnection: { createQueryBuilder: vi.fn().mockReturnValue(updateQueryBuilder) },
        },
        repo,
        updateQueryBuilder,
    };
}

describe('UnitStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when code or name is missing', async () => {
        const { connection, repo, updateQueryBuilder } = makeConnection(null);
        const handler = new UnitStreamHandler(connection as never);

        await handler.apply(ctx, 'unit-1', { code: '', name: 'Box' });

        expect(repo.save).not.toHaveBeenCalled();
        expect(updateQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('creates a new UnitRecord with explicit-zero handling for ratioToBase', async () => {
        const { connection, repo } = makeConnection(null);
        const handler = new UnitStreamHandler(connection as never);

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
        const handler = new UnitStreamHandler(connection as never);

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
        const handler = new UnitStreamHandler(connection as never);

        await handler.apply(ctx, 'unit-1', { code: 'BOX', name: 'Box', isDeleted: true });

        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));
    });

    // Bounded refresh (not a ProductVariantService.update fan-out) — real IS DISTINCT FROM
    // no-op behavior proven in unit-refresh-variants.int.test.ts against real Postgres.
    it('issues a single values-changed-only UPDATE scoped to this defaultSalesUnitId', async () => {
        const { connection, updateQueryBuilder } = makeConnection(null, 3);
        const handler = new UnitStreamHandler(connection as never);

        await handler.apply(ctx, 'unit-1', {
            code: 'BOX',
            name: 'Box',
            ratioToBase: 4,
            weightKg: 16.8,
            volumeL: 18.5,
        });

        expect(updateQueryBuilder.update).toHaveBeenCalledWith('product_variant');
        expect(updateQueryBuilder.set).toHaveBeenCalledWith({
            customFieldsUnitratiotobase: 4,
            customFieldsUnitweightkg: 16.8,
            customFieldsUnitvolumel: 18.5,
        });
        expect(updateQueryBuilder.where).toHaveBeenCalledWith(
            '"customFieldsDefaultsalesunitid" = :defaultSalesUnitId',
            { defaultSalesUnitId: 'unit-1' },
        );
        expect(updateQueryBuilder.andWhere).toHaveBeenCalledWith('"deletedAt" IS NULL');
        expect(updateQueryBuilder.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('IS DISTINCT FROM'),
            { unitRatioToBase: 4, unitWeightKg: 16.8, unitVolumeL: 18.5 },
        );
        expect(updateQueryBuilder.execute).toHaveBeenCalled();
    });
});
