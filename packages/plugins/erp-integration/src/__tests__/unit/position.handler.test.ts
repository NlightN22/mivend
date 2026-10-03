import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PositionStreamHandler } from '../../handlers/position.handler';

describe('PositionStreamHandler', () => {
    const ctx = {} as RequestContext;
    const build = (exists: boolean) => {
        const service = {
            upsert: vi.fn(),
            setActiveStateIfExists: vi.fn().mockResolvedValue(exists),
        };
        return { service, handler: new PositionStreamHandler(service as never) };
    };

    it('upserts an active position with its parent', async () => {
        const { service, handler } = build(false);
        await handler.apply(ctx, 'pos-1', { name: 'Manager', parentId: 'pos-0', isActive: true });
        expect(service.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'pos-1',
            name: 'Manager',
            parentErpId: 'pos-0',
            isActive: true,
        });
    });

    it('treats absent isActive as inactive and isDeleted as inactive', async () => {
        const { service, handler } = build(false);
        await handler.apply(ctx, 'pos-1', { name: 'Manager' });
        await handler.apply(ctx, 'pos-1', { name: 'Manager', isActive: true, isDeleted: true });
        expect(service.upsert).toHaveBeenNthCalledWith(
            1,
            ctx,
            expect.objectContaining({ isActive: false }),
        );
        expect(service.upsert).toHaveBeenNthCalledWith(
            2,
            ctx,
            expect.objectContaining({ isActive: false }),
        );
    });

    it('nameless tombstone only deactivates a known row, never upserts', async () => {
        const { service, handler } = build(true);
        await handler.apply(ctx, 'pos-1', { isDeleted: true });
        expect(service.setActiveStateIfExists).toHaveBeenCalledWith(ctx, 'pos-1', false);
        expect(service.upsert).not.toHaveBeenCalled();
    });

    it('nameless tombstone for an unknown position is skipped', async () => {
        const { service, handler } = build(false);
        await handler.apply(ctx, 'pos-x', {});
        expect(service.upsert).not.toHaveBeenCalled();
    });
});
