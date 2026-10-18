import { describe, expect, it, vi } from 'vitest';
import type { CancelOutcome } from '@mivend/plugin-reservation';

import {
    PointConfirmationExpiryService,
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
    ])('%j -> %s', (outcome, action) => {
        expect(expiryActionFor(outcome)).toBe(action);
    });
});

describe('PointConfirmationExpiryService.expireDue', () => {
    const build = (cancel: ReturnType<typeof vi.fn>) => {
        const manager = {
            query: vi
                .fn()
                .mockImplementation((sql: string) => (sql.includes('SELECT 1') ? [] : [])),
        };
        const dataSource = {
            query: vi.fn().mockResolvedValue([
                { id: '1', code: 'A' },
                { id: '2', code: 'B' },
                { id: '3', code: 'C' },
            ]),
            transaction: vi.fn((work: (m: unknown) => unknown) => work(manager)),
        };
        const notifications = { create: vi.fn().mockResolvedValue({}) };
        const service = new PointConfirmationExpiryService(
            dataSource as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            { cancel } as never,
            notifications as never,
            { defaultReservationDays: () => 3 } as never,
        );
        return { service, notifications, dataSource };
    };

    it('passes the default days, cancels with the distinct reason and notifies only for refusals', async () => {
        const cancel = vi
            .fn()
            .mockResolvedValueOnce({ kind: 'cancelled', eventSent: false })
            .mockResolvedValueOnce({ kind: 'not-cancellable', reason: 'paid' })
            .mockResolvedValueOnce({ kind: 'already-cancelled' });
        const { service, notifications, dataSource } = build(cancel);

        expect(await service.expireDue()).toBe(3);

        expect(dataSource.query.mock.calls[0][1][1]).toBe(3);
        expect(cancel.mock.calls.map(c => c[2])).toEqual(
            Array(3).fill('point-confirmation-expired'),
        );
        expect(notifications.create).toHaveBeenCalledTimes(1);
        expect(notifications.create.mock.calls[0][1]).toMatchObject({
            sourceType: 'point-confirmation-expired',
            sourceId: '2',
        });
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
