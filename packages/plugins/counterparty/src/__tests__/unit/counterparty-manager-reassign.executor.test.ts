import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError, type RequestContext } from '@vendure/core';

import { CounterpartyManagerReassignExecutor } from '../../counterparty-manager-reassign.executor';
import { ManagerChangedSinceError } from '../../counterparty-manager-assignment.service';

const ctx = {} as RequestContext;
const findOne = vi.fn();
const assertCounterpartyWritable = vi.fn();
const resolveCounterpartyScope = vi.fn();
const isTargetAssignable = vi.fn();
const reassignOne = vi.fn();

function executor(): CounterpartyManagerReassignExecutor {
    return new CounterpartyManagerReassignExecutor(
        { register: vi.fn() } as never,
        { getRepository: () => ({ findOne }) } as never,
        { assertCounterpartyWritable, resolveCounterpartyScope } as never,
        { isTargetAssignable, reassignOne } as never,
        {} as never,
    );
}

const change = { administratorId: '9' };

beforeEach(() => {
    vi.resetAllMocks();
    findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: '3' });
    assertCounterpartyWritable.mockResolvedValue(undefined);
    resolveCounterpartyScope.mockResolvedValue({ kind: 'department', branchId: 'branch-a' });
    isTargetAssignable.mockResolvedValue(true);
    reassignOne.mockResolvedValue({ previous: '3', changed: true });
});

describe('CounterpartyManagerReassignExecutor parameters (#366)', () => {
    it('requires a target manager and keeps only the id', () => {
        expect(() => executor().validate({})).toThrow(UserInputError);
        expect(() => executor().validate({ administratorId: 'abc' })).toThrow(UserInputError);
        expect(executor().validate({ administratorId: '9', extra: 1 })).toEqual(change);
    });

    it('never offers an undo of an undo', () => {
        expect(executor().undoPlan(change)).toEqual({
            type: 'counterparty-manager-reassign',
            parameters: { restore: true },
        });
        expect(executor().undoPlan({ restore: true })).toBeNull();
    });
});

describe('CounterpartyManagerReassignExecutor review and run', () => {
    it('applies and records the previous manager for the undo', async () => {
        expect(await executor().inspect(ctx, '7', change, null)).toMatchObject({
            outcome: 'applied',
        });
        expect(await executor().apply(ctx, '7', change, null)).toMatchObject({
            outcome: 'applied',
            undoData: { from: '3', to: '9' },
        });
        expect(reassignOne).toHaveBeenCalledWith(ctx, '7', '9', undefined);
    });

    it('records no undo data for a client that had no manager', async () => {
        reassignOne.mockResolvedValue({ previous: null, changed: true });
        expect(await executor().apply(ctx, '7', change, null)).toMatchObject({
            outcome: 'applied',
            undoData: null,
        });
    });

    it('skips a client outside the scope without reading the target', async () => {
        assertCounterpartyWritable.mockRejectedValue(new ForbiddenError());
        expect(await executor().inspect(ctx, '7', change, null)).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'out_of_scope',
        });
        expect(isTargetAssignable).not.toHaveBeenCalled();
    });

    it('skips a target outside the caller branch or deactivated', async () => {
        isTargetAssignable.mockResolvedValue(false);
        expect(await executor().inspect(ctx, '7', change, null)).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'target_not_allowed',
        });
    });

    it('skips a client already assigned to the target', async () => {
        findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: '9' });
        expect(await executor().inspect(ctx, '7', change, null)).toMatchObject({
            reasonCode: 'already_assigned',
        });
        reassignOne.mockResolvedValue({ previous: '9', changed: false });
        expect(await executor().apply(ctx, '7', change, null)).toMatchObject({
            reasonCode: 'already_assigned',
        });
    });

    it('turns a refusal under the lock into a skipped row', async () => {
        reassignOne.mockRejectedValue(new ForbiddenError());
        expect(await executor().apply(ctx, '7', change, null)).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'out_of_scope',
        });
    });
});

describe('CounterpartyManagerReassignExecutor undo', () => {
    const restore = { restore: true };
    const input = { from: '3', to: '9' };

    it('puts the previous manager back only while the batch manager is still in place', async () => {
        findOne.mockResolvedValue({ id: '7', shortName: 'Acme', assignedManagerId: '9' });
        expect(await executor().inspect(ctx, '7', restore, input)).toMatchObject({
            outcome: 'applied',
        });
        await executor().apply(ctx, '7', restore, input);
        expect(reassignOne).toHaveBeenCalledWith(ctx, '7', '3', '9');
    });

    it('skips a client whose manager was changed after the batch', async () => {
        expect(await executor().inspect(ctx, '7', restore, input)).toMatchObject({
            reasonCode: 'changed_since',
        });
        reassignOne.mockRejectedValue(new ManagerChangedSinceError());
        expect(await executor().apply(ctx, '7', restore, input)).toMatchObject({
            reasonCode: 'changed_since',
        });
    });

    it('skips a record that has nothing to restore', async () => {
        expect(await executor().apply(ctx, '7', restore, null)).toMatchObject({
            reasonCode: 'nothing_to_restore',
        });
        expect(reassignOne).not.toHaveBeenCalled();
    });
});
