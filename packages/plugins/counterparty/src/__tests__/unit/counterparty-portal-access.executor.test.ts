import { ForbiddenError } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CounterpartyPortalAccessExecutor } from '../../counterparty-portal-access.executor';
import { PortalAccessPreconditionError } from '../../counterparty-portal-access.service';

const counterparty = {
    id: '5',
    shortName: 'Client',
    isActive: true,
    phone: '+1',
    officialEmail: 'a@example.test',
};
const repo = { findOne: vi.fn() };
const connection = { getRepository: () => repo };
const accessScope = { assertCounterpartyWritable: vi.fn() };
const portalAccess = {
    linkedCustomerId: vi.fn(),
    activate: vi.fn(),
    revoke: vi.fn(),
};
const ctx = {} as never;

const executor = new CounterpartyPortalAccessExecutor(
    { register: vi.fn() } as never,
    connection as never,
    accessScope as never,
    portalAccess as never,
);

beforeEach(() => {
    vi.clearAllMocks();
    repo.findOne.mockResolvedValue(counterparty);
    accessScope.assertCounterpartyWritable.mockResolvedValue(undefined);
    portalAccess.linkedCustomerId.mockResolvedValue(null);
});

describe('CounterpartyPortalAccessExecutor', () => {
    it('validates the action and declares undo only for a grant', () => {
        expect(executor.validate({ action: 'activate' })).toEqual({ action: 'activate' });
        expect(() => executor.validate({ action: 'x' })).toThrow();
        expect(executor.undoPlan({ action: 'activate' })).toMatchObject({
            parameters: { action: 'deactivate' },
        });
        expect(executor.undoPlan({ action: 'deactivate' })).toBeNull();
    });

    it.each([
        ['no row', null, 'not_found'],
        ['inactive', { ...counterparty, isActive: false }, 'inactive'],
        ['no e-mail', { ...counterparty, officialEmail: null }, 'no_contact'],
    ])('review skips a grant for %s', async (_name, row, code) => {
        repo.findOne.mockResolvedValue(row);
        const verdict = await executor.inspect(ctx, '5', { action: 'activate' });
        expect(verdict).toMatchObject({ outcome: 'skipped', reasonCode: code });
    });

    it('review skips an already active grant and a revoke without access', async () => {
        portalAccess.linkedCustomerId.mockResolvedValue('9');
        expect(await executor.inspect(ctx, '5', { action: 'activate' })).toMatchObject({
            reasonCode: 'already_active',
        });
        portalAccess.linkedCustomerId.mockResolvedValue(null);
        expect(await executor.inspect(ctx, '5', { action: 'deactivate' })).toMatchObject({
            reasonCode: 'no_portal_access',
        });
    });

    it('a record outside the actor scope is skipped without a label and never changed', async () => {
        accessScope.assertCounterpartyWritable.mockRejectedValue(new ForbiddenError());
        expect(await executor.inspect(ctx, '5', { action: 'activate' })).toMatchObject({
            reasonCode: 'out_of_scope',
            label: null,
        });
        portalAccess.activate.mockRejectedValue(new ForbiddenError());
        expect(await executor.apply(ctx, '5', { action: 'activate' })).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'out_of_scope',
        });
    });

    it('apply maps a lost race to a skip and lets other errors fail the row', async () => {
        portalAccess.activate.mockRejectedValue(
            new PortalAccessPreconditionError('already_active', 'already'),
        );
        expect(await executor.apply(ctx, '5', { action: 'activate' })).toMatchObject({
            outcome: 'skipped',
            reasonCode: 'already_active',
        });
        portalAccess.revoke.mockRejectedValue(new Error('db down'));
        await expect(executor.apply(ctx, '5', { action: 'deactivate' })).rejects.toThrow('db down');
        portalAccess.activate.mockResolvedValue({ id: '1' });
        expect(await executor.apply(ctx, '5', { action: 'activate' })).toMatchObject({
            outcome: 'applied',
        });
    });
});
