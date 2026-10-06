import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { LegalFormStreamHandler } from '../../handlers/legal-form.handler';
import { RegionStreamHandler } from '../../handlers/region.handler';

const ctx = {} as RequestContext;

function setup<T>(Handler: new (c: never) => T, existing: Record<string, unknown> | null) {
    const save = vi.fn();
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((v: unknown) => v),
        save,
    };
    const handler = new Handler({ getRepository: () => repo } as never);
    return { handler, save };
}

describe('RegionStreamHandler', () => {
    it('creates a row, omitted optionals become null', async () => {
        const { handler, save } = setup(RegionStreamHandler, null);
        await handler.apply(ctx, 'r-1', { name: 'Region A', code: '01', isActive: true });
        expect(save).toHaveBeenCalledWith({
            entityId: 'r-1',
            name: 'Region A',
            code: '01',
            regionCode: null,
            addressCode: null,
            parentId: null,
            isActive: true,
            isDeleted: false,
        });
    });

    it('latest event wins: a repeat replaces optional fields, parent stays a soft link', async () => {
        const { handler, save } = setup(RegionStreamHandler, {
            entityId: 'r-1',
            name: 'Old',
            code: '01',
            parentId: 'gone',
        });
        await handler.apply(ctx, 'r-1', {
            name: 'New',
            code: '01',
            parentId: 'r-0',
            isActive: true,
        });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ entityId: 'r-1', name: 'New', parentId: 'r-0' }),
        );
    });

    it('tombstone keeps the row, marks deleted and inactive', async () => {
        const { handler, save } = setup(RegionStreamHandler, null);
        await handler.apply(ctx, 'r-1', { name: 'A', code: '01', isActive: true, isDeleted: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ isDeleted: true, isActive: false }),
        );
    });

    it('skips an event without name or code', async () => {
        const { handler, save } = setup(RegionStreamHandler, null);
        await handler.apply(ctx, 'r-1', { name: 'A' });
        expect(save).not.toHaveBeenCalled();
    });
});

describe('LegalFormStreamHandler', () => {
    it('creates a row with optional fullName', async () => {
        const { handler, save } = setup(LegalFormStreamHandler, null);
        await handler.apply(ctx, 'lf-1', {
            name: 'LLC',
            code: '12',
            fullName: 'Limited',
            isActive: true,
        });
        expect(save).toHaveBeenCalledWith({
            entityId: 'lf-1',
            name: 'LLC',
            code: '12',
            fullName: 'Limited',
            isActive: true,
            isDeleted: false,
        });
    });

    it('an omitted fullName clears the stored one (latest wins)', async () => {
        const { handler, save } = setup(LegalFormStreamHandler, {
            entityId: 'lf-1',
            name: 'LLC',
            code: '12',
            fullName: 'Limited',
        });
        await handler.apply(ctx, 'lf-1', { name: 'LLC', code: '12', isActive: true });
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ fullName: null }));
    });

    it('tombstone marks deleted', async () => {
        const { handler, save } = setup(LegalFormStreamHandler, null);
        await handler.apply(ctx, 'lf-1', { name: 'LLC', code: '12', isDeleted: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ isDeleted: true, isActive: false }),
        );
    });

    it('skips an event without name or code', async () => {
        const { handler, save } = setup(LegalFormStreamHandler, null);
        await handler.apply(ctx, 'lf-1', { code: '12' });
        expect(save).not.toHaveBeenCalled();
    });
});
