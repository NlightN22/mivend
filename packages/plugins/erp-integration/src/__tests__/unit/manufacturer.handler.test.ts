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
    it('upserts the trimmed name keyed by entity id', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: '  Acme ' });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme');
    });

    it('keeps the name of a deleted manufacturer', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: 'Acme', isDeleted: true });
        expect(upsert).toHaveBeenCalledWith(ctx, 'm-1', 'Acme');
    });

    it('skips an event without a name', async () => {
        const { upsert, handler } = setup();
        await handler.apply(ctx, 'm-1', { name: ' ' });
        expect(upsert).not.toHaveBeenCalled();
    });
});
