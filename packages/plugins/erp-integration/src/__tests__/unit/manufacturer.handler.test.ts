import type { RequestContext } from '@vendure/core';
import { describe, expect, it, Mock, vi } from 'vitest';

import { ManufacturerStreamHandler } from '../../handlers/manufacturer.handler';
import type { ManufacturerService } from '../../manufacturer.service';

const ctx = {} as RequestContext;

function setup(): { upsert: Mock; handler: ManufacturerStreamHandler } {
    const upsert = vi.fn();
    const handler = new ManufacturerStreamHandler({ upsert } as unknown as ManufacturerService);
    return { upsert, handler };
}

describe('ManufacturerStreamHandler', () => {
    it('upserts the trimmed name as active, keyed by entity id', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue({});
        expect(await handler.apply(ctx, 'm-1', { name: '  Acme ', isActive: true })).toEqual({
            kind: 'applied',
        });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', true, null);
    });

    it('treats an absent isActive as inactive', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme' });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', false, null);
    });

    it('deactivates an existing row on a nameless event without isActive, name untouched', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue({});
        await handler.apply(ctx, 'm-1', { name: '' });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', undefined, false, null);
    });

    it('deactivates on isDeleted, keeping the name', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme', isDeleted: true });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', false, undefined);
    });

    it('deactivates on isActive=false and reactivates on a later active event', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme', isActive: false });
        await handler.apply(ctx, 'm-1', { name: 'Acme', isActive: true });
        expect(upsert).toHaveBeenNthCalledWith(1, ctx, 'm-1', 'Acme', false, null);
        expect(upsert).toHaveBeenNthCalledWith(2, ctx, 'm-1', 'Acme', true, null);
    });

    it('applies a nameless tombstone as deactivation', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue({});
        const out = await handler.apply(ctx, 'm-1', { name: '', isDeleted: true });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', undefined, false, undefined);
        expect(out.kind).toBe('applied');
    });

    it('passes the parent group, ignoring a self link and leaving a tombstone parent alone', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'A', isActive: true, parentId: 'g-1' });
        await handler.apply(ctx, 'm-1', { name: 'A', isActive: true, parentId: 'm-1' });
        await handler.apply(ctx, 'm-1', { name: 'A', isDeleted: true, parentId: 'g-1' });
        expect(upsert).toHaveBeenNthCalledWith(1, ctx, 'm-1', 'A', true, 'g-1');
        expect(upsert).toHaveBeenNthCalledWith(2, ctx, 'm-1', 'A', true, null);
        expect(upsert).toHaveBeenNthCalledWith(3, ctx, 'm-1', 'A', false, undefined);
    });

    it('is a noop for a nameless event of an unknown manufacturer', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue(null);
        expect((await handler.apply(ctx, 'm-1', { name: ' ', isActive: false })).kind).toBe('noop');
    });

    it('propagates storage errors', async () => {
        const { upsert, handler } = setup();
        upsert.mockRejectedValue(new Error('db down'));
        await expect(handler.apply(ctx, 'm-1', { name: 'A' })).rejects.toThrow('db down');
    });
});
