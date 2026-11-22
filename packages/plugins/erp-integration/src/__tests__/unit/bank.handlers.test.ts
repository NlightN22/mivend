import type { RequestContext } from '@vendure/core';
import { describe, expect, it, Mock, vi } from 'vitest';

import { BankAccountStreamHandler } from '../../handlers/bank-account.handler';
import { BankStreamHandler } from '../../handlers/bank.handler';

const ctx = {} as RequestContext;

const refresh = vi.fn(async () => 1);

function setup<T>(
    Handler: new (c: never, b: never) => T,
    existing: Record<string, unknown> | null,
): { handler: T; save: Mock } {
    const save = vi.fn();
    const repo = {
        findOne: vi.fn().mockResolvedValue(existing),
        create: vi.fn((v: unknown) => v),
        save,
    };
    return {
        handler: new Handler({ getRepository: () => repo } as never, { refresh } as never),
        save,
    };
}

describe('bank chain', () => {
    it('a bank event refreshes the requisites of the organizations that use it', async () => {
        const { handler } = setup(BankStreamHandler, null);
        await handler.apply(ctx, 'b-1', { name: 'Bank A', bik: '000000001' });
        expect(refresh).toHaveBeenCalledWith(ctx, { bankId: 'b-1' });
    });

    it('a bank account event refreshes the organizations whose main account it is', async () => {
        const { handler } = setup(BankAccountStreamHandler, null);
        await handler.apply(ctx, 'a-1', {
            accountNumber: '4070',
            bankId: 'b-1',
            ownerId: 'o-1',
            ownerType: 'organization',
        });
        expect(refresh).toHaveBeenCalledWith(ctx, { bankAccountId: 'a-1' });
    });
});

describe('BankStreamHandler', () => {
    it('creates a row; absent optional correspondent account is null, absent isActive is false', async () => {
        const { handler, save } = setup(BankStreamHandler, null);
        await handler.apply(ctx, 'b-1', { name: 'Bank A', bik: '000000001' });
        expect(save).toHaveBeenCalledWith({
            entityId: 'b-1',
            name: 'Bank A',
            bik: '000000001',
            correspondentAccount: null,
            isActive: false,
            isDeleted: false,
        });
    });

    it('latest event wins on a repeat', async () => {
        const { handler, save } = setup(BankStreamHandler, {
            entityId: 'b-1',
            name: 'Old',
            bik: '1',
            correspondentAccount: 'x',
        });
        await handler.apply(ctx, 'b-1', { name: 'New', bik: '1', isActive: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New', correspondentAccount: null, isActive: true }),
        );
    });

    it('tombstone keeps the row as deleted', async () => {
        const { handler, save } = setup(BankStreamHandler, null);
        await handler.apply(ctx, 'b-1', { name: 'A', bik: '1', isActive: true, isDeleted: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ isDeleted: true, isActive: false }),
        );
    });

    it('skips an event without name or bik', async () => {
        const { handler, save } = setup(BankStreamHandler, null);
        await handler.apply(ctx, 'b-1', { name: 'A' });
        expect(save).not.toHaveBeenCalled();
    });
});

describe('BankAccountStreamHandler', () => {
    const payload = {
        accountNumber: '4070',
        bankId: 'b-absent',
        ownerId: 'cp-1',
        ownerType: 'Counterparty',
    };

    it('stores bank and owner as plain ids even when they have not arrived', async () => {
        const { handler, save } = setup(BankAccountStreamHandler, null);
        await handler.apply(ctx, 'ba-1', { ...payload, isActive: true });
        expect(save).toHaveBeenCalledWith({
            entityId: 'ba-1',
            ...payload,
            isActive: true,
            isDeleted: false,
        });
    });

    it('latest event wins and tombstone keeps the row', async () => {
        const { handler, save } = setup(BankAccountStreamHandler, { entityId: 'ba-1', ...payload });
        await handler.apply(ctx, 'ba-1', { ...payload, bankId: 'b-2', isDeleted: true });
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ bankId: 'b-2', isDeleted: true, isActive: false }),
        );
    });

    it('skips an event missing a required field', async () => {
        const { handler, save } = setup(BankAccountStreamHandler, null);
        await handler.apply(ctx, 'ba-1', { accountNumber: '4070' });
        expect(save).not.toHaveBeenCalled();
    });
});
