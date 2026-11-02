import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { ManufacturerStreamHandler } from '../../handlers/manufacturer.handler';
import type { ManufacturerService } from '../../manufacturer.service';

const ctx = {} as RequestContext;

function setup() {
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
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', true);
    });

    it('treats an absent isActive as inactive', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme' });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', false);
    });

    it('deactivates an existing row on a nameless event without isActive, name untouched', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue({});
        await handler.apply(ctx, 'm-1', { name: '' });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', undefined, false);
    });

    it('deactivates on isDeleted, keeping the name', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme', isDeleted: true });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme', false);
    });

    it('deactivates on isActive=false and reactivates on a later active event', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme', isActive: false });
        await handler.apply(ctx, 'm-1', { name: 'Acme', isActive: true });
        expect(upsert).toHaveBeenNthCalledWith(1, ctx, 'm-1', 'Acme', false);
        expect(upsert).toHaveBeenNthCalledWith(2, ctx, 'm-1', 'Acme', true);
    });

    it('applies a nameless tombstone as deactivation', async () => {
        const { upsert, handler } = setup();
        upsert.mockResolvedValue({});
        const out = await handler.apply(ctx, 'm-1', { name: '', isDeleted: true });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', undefined, false);
        expect(out.kind).toBe('applied');
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
