import { passthroughGuard } from './contact-guard';
import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { CounterpartyContactStreamHandler } from '../../handlers/counterparty-contact.handler';
import { CounterpartyGroupStreamHandler } from '../../handlers/counterparty-group.handler';
import { PointOfSaleTypeStreamHandler } from '../../handlers/point-of-sale-type.handler';
import { ProductGroupStreamHandler } from '../../handlers/product-group.handler';
import { SettingStreamHandler } from '../../handlers/setting.handler';

const ctx = {} as RequestContext;

function setup<T extends { apply: (...a: never[]) => unknown }>(
    Handler: new (c: never, p: never, k: never) => T,
    existing: Record<string, unknown> | null,
): { handler: T; save: ReturnType<typeof vi.fn> } {
    const save = vi.fn();
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((v: unknown) => v),
        save,
    };
    const persons = { upsert: vi.fn().mockResolvedValue(1), deactivate: vi.fn() };
    const handler = new Handler(
        { getRepository: () => repo } as never,
        persons as never,
        { guarded: passthroughGuard, replaceErpPoints: vi.fn() } as never,
    );
    return { handler, save };
}

describe('CounterpartyContactStreamHandler', () => {
    const infos = [
        { type: 'phone', kindName: 'Work', isPrimary: true, presentation: 'x@example.com' },
    ];

    it('stores the contact as sent, contactInfos untouched, even when the counterparty is unknown', async () => {
        const { handler, save } = setup(CounterpartyContactStreamHandler, null);
        const outcome = await handler.apply(ctx, 'c-1', {
            counterpartyId: 'cp-never-synced',
            name: 'Contact A',
            phone: 'x@example.com',
            isActive: true,
            contactInfos: infos,
        });
        expect(outcome.kind).toBe('applied');
        expect(save).toHaveBeenCalledWith({
            erpId: 'c-1',
            counterpartyId: 'cp-never-synced',
            name: 'Contact A',
            position: null,
            phone: 'x@example.com',
            email: null,
            contactInfos: JSON.stringify(infos),
            isActive: true,
            isDeleted: false,
        });
    });

    it('a duplicate delivery saves the same state onto the existing row', async () => {
        const first = setup(CounterpartyContactStreamHandler, null);
        const payload = { counterpartyId: 'cp-1', name: 'Contact A', isActive: true };
        await first.handler.apply(ctx, 'c-1', payload);
        const stored = first.save.mock.calls[0][0];

        const again = setup(CounterpartyContactStreamHandler, stored);
        await again.handler.apply(ctx, 'c-1', payload);
        expect(again.save).toHaveBeenCalledWith(stored);
    });

    it('a newer named event replaces absent optionals with null', async () => {
        const { handler, save } = setup(CounterpartyContactStreamHandler, {
            erpId: 'c-1',
            counterpartyId: 'cp-1',
            name: 'Contact A',
            email: 'old@example.com',
        });
        await handler.apply(ctx, 'c-1', { counterpartyId: 'cp-1', name: 'Contact A' });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ email: null, contactInfos: '[]', isActive: false }),
        );
    });

    it('a tombstone keeps the stored values and only flips the flags', async () => {
        const { handler, save } = setup(CounterpartyContactStreamHandler, {
            erpId: 'c-1',
            counterpartyId: 'cp-1',
            name: 'Contact A',
            isActive: true,
            isDeleted: false,
        });
        await handler.apply(ctx, 'c-1', { isDeleted: true });
        expect(save).toHaveBeenCalledWith({
            erpId: 'c-1',
            counterpartyId: 'cp-1',
            name: 'Contact A',
            isActive: false,
            isDeleted: true,
        });
    });
});

describe('dictionary handlers', () => {
    it('counterparty-group keeps a parent that was never synced as a soft id', async () => {
        const { handler, save } = setup(CounterpartyGroupStreamHandler, null);
        await handler.apply(ctx, 'g-1', { name: 'Group A', parentId: 'g-gone', isActive: true });
        expect(save).toHaveBeenCalledWith({
            erpId: 'g-1',
            name: 'Group A',
            parentId: 'g-gone',
            isActive: true,
            isDeleted: false,
        });
    });

    it('product-group stores code and parent, a tombstone marks it deleted without a delete', async () => {
        const { handler, save } = setup(ProductGroupStreamHandler, null);
        await handler.apply(ctx, 'pg-1', { name: 'Goods', code: '01', isActive: true });
        expect(save).toHaveBeenLastCalledWith(
            expect.objectContaining({ code: '01', parentId: null, isDeleted: false }),
        );

        const tomb = setup(ProductGroupStreamHandler, { erpId: 'pg-1', name: 'Goods' });
        await tomb.handler.apply(ctx, 'pg-1', { isDeleted: true });
        expect(tomb.save).toHaveBeenCalledWith({
            erpId: 'pg-1',
            name: 'Goods',
            isActive: false,
            isDeleted: true,
        });
    });

    it('point-of-sale-type stores name and code', async () => {
        const { handler, save } = setup(PointOfSaleTypeStreamHandler, null);
        await handler.apply(ctx, 't-1', { name: 'Kiosk', code: 'K', isActive: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ erpId: 't-1', name: 'Kiosk', code: 'K' }),
        );
    });

    it('setting stores the bool as sent, absent bool is null, tombstone sets only isDeleted', async () => {
        const { handler, save } = setup(SettingStreamHandler, null);
        await handler.apply(ctx, 's-1', { code: 'flag-a', boolValue: false });
        expect(save).toHaveBeenCalledWith({
            erpId: 's-1',
            code: 'flag-a',
            boolValue: false,
            isDeleted: false,
        });

        const none = setup(SettingStreamHandler, { erpId: 's-1', code: 'flag-a', boolValue: true });
        await none.handler.apply(ctx, 's-1', { code: 'flag-a' });
        expect(none.save).toHaveBeenCalledWith(expect.objectContaining({ boolValue: null }));

        const tomb = setup(SettingStreamHandler, { erpId: 's-1', code: 'flag-a', boolValue: true });
        await tomb.handler.apply(ctx, 's-1', { isDeleted: true });
        expect(tomb.save).toHaveBeenCalledWith({
            erpId: 's-1',
            code: 'flag-a',
            boolValue: true,
            isDeleted: true,
        });
    });
});
