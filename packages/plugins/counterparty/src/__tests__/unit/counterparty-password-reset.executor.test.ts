import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserInputError, type RequestContext } from '@vendure/core';

import { CounterpartyPasswordResetExecutor } from '../../counterparty-password-reset.executor';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    withAggregateLock: vi.fn(
        async (_c: unknown, ctx: unknown, _k: string, work: (c: unknown) => Promise<unknown>) =>
            work(ctx),
    ),
}));

const ctx = {} as RequestContext;
const findOne = vi.fn();
const assertCounterpartyWritable = vi.fn();
const linkedCustomerId = vi.fn();
const findCustomer = vi.fn();
const requestPasswordReset = vi.fn();

function executor(): CounterpartyPasswordResetExecutor {
    return new CounterpartyPasswordResetExecutor(
        { register: vi.fn() } as never,
        { getRepository: () => ({ findOne }) } as never,
        { assertCounterpartyWritable } as never,
        { linkedCustomerId } as never,
        {} as never,
        { findOne: findCustomer, requestPasswordReset } as never,
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    findOne.mockResolvedValue({ id: '7', shortName: 'Acme' });
    assertCounterpartyWritable.mockResolvedValue(undefined);
    linkedCustomerId.mockResolvedValue('11');
    findCustomer.mockResolvedValue({ id: '11', emailAddress: 'office@example.com' });
});

describe('CounterpartyPasswordResetExecutor (#375)', () => {
    it('sends one set-password mail to the live login', async () => {
        const verdict = await executor().apply(ctx, '7');
        expect(verdict).toMatchObject({ outcome: 'applied', label: 'Acme' });
        expect(requestPasswordReset).toHaveBeenCalledTimes(1);
        expect(requestPasswordReset).toHaveBeenCalledWith(ctx, 'office@example.com');
    });

    it('skips a counterparty without a live login and sends nothing', async () => {
        linkedCustomerId.mockResolvedValue(null);
        expect(await executor().inspect(ctx, '7')).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'no_login',
        });
        expect(await executor().apply(ctx, '7')).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'no_login',
        });
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it('skips a counterparty outside the scope without reading its login', async () => {
        const { ForbiddenError } = await import('@vendure/core');
        assertCounterpartyWritable.mockRejectedValue(new ForbiddenError());
        expect(await executor().inspect(ctx, '7')).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'out_of_scope',
        });
        expect(await executor().apply(ctx, '7')).toMatchObject({ reasonCode: 'out_of_scope' });
        expect(linkedCustomerId).not.toHaveBeenCalled();
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it('skips an unknown or malformed id', async () => {
        findOne.mockResolvedValue(null);
        expect(await executor().apply(ctx, '99')).toMatchObject({ reasonCode: 'not_found' });
        expect(await executor().apply(ctx, 'abc')).toMatchObject({ reasonCode: 'not_found' });
    });

    it('takes no parameters and needs the portal access permission', () => {
        expect(executor().validate({})).toEqual({});
        expect(() => executor().validate({ action: 'x' })).toThrow(UserInputError);
        expect(executor().permission).toBe('ManageCounterpartyPortalAccess');
        expect('undoPlan' in executor()).toBe(false);
    });
});
