import { describe, expect, it, vi } from 'vitest';
import type { CancelOutcome } from '@mivend/plugin-reservation';

import {
    PointConfirmationExpiryService,
    describeRefusal,
    expiryActionFor,
} from '../../order-checks/point-confirmation-expiry.service';

describe('expiryActionFor', () => {
    it.each<[CancelOutcome, string]>([
        [{ kind: 'cancelled', eventSent: false }, 'done'],
        [{ kind: 'already-cancelled' }, 'done'],
        [{ kind: 'cancel-requested' }, 'done'],
        [{ kind: 'not-cancellable', reason: 'paid' }, 'notify'],
        [{ kind: 'not-cancellable', reason: 'in-progress' }, 'notify'],
        [{ kind: 'left-to-erp' }, 'notify'],
        [{ kind: 'reserve-not-due' }, 'done'],
    ])('%j -> %s', (outcome, action) => {
        expect(expiryActionFor(outcome)).toBe(action);
    });
});

describe('describeRefusal', () => {
    it.each<[CancelOutcome, string]>([
        [{ kind: 'not-cancellable', reason: 'paid' }, 'settled payment'],
        [{ kind: 'not-cancellable', reason: 'in-progress' }, 'being processed'],
        [{ kind: 'not-cancellable', reason: 'shipped' }, 'shipped'],
        [{ kind: 'not-cancellable', reason: 'registration-rejected' }, 'rejected'],
        [{ kind: 'left-to-erp' }, 'left to it'],
    ])('%j is plain English', (outcome, fragment) => {
        const text = describeRefusal(outcome);
        expect(text).toContain(fragment);
        expect(text).not.toMatch(/left-to-erp|not-cancellable/);
    });
});

describe('PointConfirmationExpiryService.expireDue', () => {
    const build = (cancel: ReturnType<typeof vi.fn>) => {
        const due = [
            { id: '1', code: 'A' },
            { id: '2', code: 'B' },
            { id: '3', code: 'C' },
        ];
        const query = vi.fn(async (sql: string) => (sql.includes('SELECT DISTINCT') ? due : []));
        const connection = {
            getRepository: () => ({ query }),
            withTransaction: vi.fn((ctx: unknown, work: (c: unknown) => unknown) => work(ctx)),
        };
        const notifications = { create: vi.fn().mockResolvedValue({}) };
        const service = new PointConfirmationExpiryService(
            connection as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            { cancel } as never,
            notifications as never,
            { defaultReservationDays: () => 3 } as never,
        );
        return { service, notifications, query };
    };

    it('passes the default days, cancels with the distinct reason and notifies only for refusals', async () => {
        const cancel = vi
            .fn()
            .mockResolvedValueOnce({ kind: 'cancelled', eventSent: false })
            .mockResolvedValueOnce({ kind: 'not-cancellable', reason: 'paid' })
            .mockResolvedValueOnce({ kind: 'already-cancelled' });
        const { service, notifications, query } = build(cancel);

        expect(await service.expireDue()).toBe(3);

        expect((query.mock.calls[0] as unknown[])[1]).toEqual([expect.anything(), 3]);
        expect(cancel.mock.calls.map(c => c[2])).toEqual(
            Array(3).fill('point-confirmation-expired'),
        );
        expect(notifications.create).toHaveBeenCalledTimes(1);
        expect(notifications.create.mock.calls[0][1]).toMatchObject({
            sourceType: 'point-confirmation-expired',
            sourceId: '2',
            message: expect.stringContaining('settled payment'),
        });
    });

    it('a not-due outcome is neither a notification nor an error', async () => {
        const cancel = vi.fn().mockResolvedValue({ kind: 'reserve-not-due' });
        const { service, notifications } = build(cancel);

        expect(await service.expireDue()).toBe(3);
        expect(notifications.create).not.toHaveBeenCalled();
    });

    it('one failing order does not starve the others and the sweep still fails', async () => {
        const cancel = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue({ kind: 'cancelled', eventSent: false });
        const { service } = build(cancel);

        await expect(service.expireDue()).rejects.toThrow('boom');
        expect(cancel).toHaveBeenCalledTimes(3);
    });
});
