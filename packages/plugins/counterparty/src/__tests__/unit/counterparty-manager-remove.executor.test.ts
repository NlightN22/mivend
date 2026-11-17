import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError, type RequestContext } from '@vendure/core';

import { CounterpartyManagerRemoveExecutor } from '../../counterparty-manager-remove.executor';
import { ManagerChangedSinceError } from '../../counterparty-manager-assignment.service';

const ctx = {} as RequestContext;
const findOne = vi.fn();
const assertCounterpartyWritable = vi.fn();
const resolveCounterpartyScope = vi.fn();
const isTargetAssignable = vi.fn();
const reassignOne = vi.fn();

function executor(): CounterpartyManagerRemoveExecutor {
    return new CounterpartyManagerRemoveExecutor(
        { register: vi.fn() } as never,
        { getRepository: () => ({ findOne }) } as never,
        { assertCounterpartyWritable, resolveCounterpartyScope } as never,
        { isTargetAssignable, reassignOne } as never,
        {} as never,
    );
}

const removal = { confirmed: true };
const restore = { restore: true };

beforeEach(() => {
    vi.resetAllMocks();
    findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: '3' });
    assertCounterpartyWritable.mockResolvedValue(undefined);
    resolveCounterpartyScope.mockResolvedValue({ kind: 'all' });
    isTargetAssignable.mockResolvedValue(true);
    reassignOne.mockResolvedValue({ previous: '3', changed: true });
});

describe('CounterpartyManagerRemoveExecutor parameters (#366)', () => {
    it('refuses a removal that is not confirmed', () => {
        expect(() => executor().validate({})).toThrow(UserInputError);
        expect(() => executor().validate({ confirmed: 'yes' })).toThrow(UserInputError);
        expect(executor().validate({ confirmed: true, extra: 1 })).toEqual(removal);
        expect(executor().validate({ restore: true })).toEqual(restore);
    });

    it('offers an undo of the removal and none of the undo', () => {
        expect(executor().undoPlan(removal)).toEqual({
            type: 'counterparty-manager-remove',
            parameters: restore,
        });
        expect(executor().undoPlan(restore)).toBeNull();
    });
});

describe('CounterpartyManagerRemoveExecutor removal', () => {
    it('removes the manager and records the previous one for the undo', async () => {
        expect(await executor().inspect(ctx, '7', removal, null)).toMatchObject({
            outcome: 'applied',
        });
        expect(await executor().apply(ctx, '7', removal, null)).toMatchObject({
            outcome: 'applied',
            undoData: { from: '3', to: null },
        });
        expect(reassignOne).toHaveBeenCalledWith(ctx, '7', null, undefined);
    });

    it('skips a client that already has no manager', async () => {
        findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: null });
        expect(await executor().inspect(ctx, '7', removal, null)).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'no_manager',
        });
        reassignOne.mockResolvedValue({ previous: null, changed: false });
        expect(await executor().apply(ctx, '7', removal, null)).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'no_manager',
        });
    });

    it('skips a client outside the scope', async () => {
        assertCounterpartyWritable.mockRejectedValue(new ForbiddenError());
        expect(await executor().inspect(ctx, '7', removal, null)).toMatchObject({
            reasonCode: 'out_of_scope',
        });
        reassignOne.mockRejectedValue(new ForbiddenError());
        expect(await executor().apply(ctx, '7', removal, null)).toMatchObject({
            reasonCode: 'out_of_scope',
        });
    });
});

describe('CounterpartyManagerRemoveExecutor undo', () => {
    const input = { from: '3', to: null };

    it('puts the manager back while the client is still without one', async () => {
        findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: null });
        expect(await executor().inspect(ctx, '7', restore, input)).toMatchObject({
            outcome: 'applied',
        });
        reassignOne.mockResolvedValue({ previous: null, changed: true });
        expect(await executor().apply(ctx, '7', restore, input)).toMatchObject({
            outcome: 'applied',
            undoData: null,
        });
        expect(reassignOne).toHaveBeenCalledWith(ctx, '7', '3', null);
    });

    it('skips when a manager was assigned meanwhile', async () => {
        expect(await executor().inspect(ctx, '7', restore, input)).toMatchObject({
            reasonCode: 'changed_since',
        });
        reassignOne.mockRejectedValue(new ManagerChangedSinceError());
        expect(await executor().apply(ctx, '7', restore, input)).toMatchObject({
            reasonCode: 'changed_since',
        });
    });

    it('skips a record with no recorded manager and a manager outside the branch', async () => {
        expect(await executor().inspect(ctx, '7', restore, null)).toMatchObject({
            reasonCode: 'nothing_to_restore',
        });
        findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: null });
        isTargetAssignable.mockResolvedValue(false);
        expect(await executor().inspect(ctx, '7', restore, input)).toMatchObject({
            reasonCode: 'target_not_allowed',
        });
    });
});
