import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { NonRetryableInboundError } from '../../non-retryable-inbound-error';
import { CounterpartyCreditBalanceStreamHandler } from '../../handlers/counterparty-credit-balance.handler';

describe('CounterpartyCreditBalanceStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('updates creditBalance by counterpartyId, not by the register entry entityId', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', {
            counterpartyId: 'cp-1',
            balance: 12345,
        });

        expect(counterpartyService.updateCreditBalance).toHaveBeenCalledWith(ctx, 'cp-1', 12345);
    });

    // Counterparty.creditBalance is a bigint in whole rubles; only this stream sends fractions.
    // Round before the write, not truncate: 100.6 must become 101.
    it('rounds a fractional balance to the nearest whole ruble before writing it', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', {
            counterpartyId: 'cp-1',
            balance: -20906.8,
        });

        expect(counterpartyService.updateCreditBalance).toHaveBeenCalledWith(ctx, 'cp-1', -20907);
    });

    it('rounds .5 up for a positive fractional balance', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', { counterpartyId: 'cp-1', balance: 100.5 });

        expect(counterpartyService.updateCreditBalance).toHaveBeenCalledWith(ctx, 'cp-1', 101);
    });

    it('skips when counterpartyId is missing (malformed payload, not retryable)', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', { balance: 100 });

        expect(counterpartyService.updateCreditBalance).not.toHaveBeenCalled();
    });

    it('reads an absent balance as zero (proto3 omits zero scalars)', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        const outcome = await handler.apply(ctx, 'register-entry-1', { counterpartyId: 'cp-1' });

        expect(outcome.kind).toBe('applied');
        expect(counterpartyService.updateCreditBalance).toHaveBeenCalledWith(ctx, 'cp-1', 0);
    });

    it('fails visibly on a non-numeric balance', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await expect(
            handler.apply(ctx, 'register-entry-1', { counterpartyId: 'cp-1', balance: 'abc' }),
        ).rejects.toBeInstanceOf(NonRetryableInboundError);
        expect(counterpartyService.updateCreditBalance).not.toHaveBeenCalled();
    });

    // A deleted register entry does not mean the real balance became zero — never fabricate that.
    it('skips a deleted register entry without touching creditBalance', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', {
            counterpartyId: 'cp-1',
            balance: 500,
            isDeleted: true,
        });

        expect(counterpartyService.updateCreditBalance).not.toHaveBeenCalled();
    });

    it('accepts a balance of exactly zero (a real, valid value, not "missing")', async () => {
        const counterpartyService = { updateCreditBalance: vi.fn().mockResolvedValue(undefined) };
        const handler = new CounterpartyCreditBalanceStreamHandler(counterpartyService as never);

        await handler.apply(ctx, 'register-entry-1', { counterpartyId: 'cp-1', balance: 0 });

        expect(counterpartyService.updateCreditBalance).toHaveBeenCalledWith(ctx, 'cp-1', 0);
    });
});
