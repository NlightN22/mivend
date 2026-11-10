import { describe, expect, it } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { SettlementAdminResolver } from '../../settlement-admin.resolver';
import { summariseOverdue } from '../../settlement-aging';

const NOW = new Date('2026-11-10T00:00:00Z');
const card = (overdue: number, due: string | null) => ({
    overdue,
    currency: 'RUB',
    oldestOverdueDue: due ? new Date(due) : null,
});

describe('summariseOverdue', () => {
    it('sums the contracts and counts days from the oldest due date', () => {
        expect(
            summariseOverdue(
                [
                    card(500, '2026-11-05T00:00:00Z'),
                    card(200, '2026-10-30T00:00:00Z'),
                    card(0, null),
                ],
                NOW,
            ),
        ).toEqual({ amount: 700, currency: 'RUB', oldestDays: 11 });
    });

    it('has no days when nothing is overdue', () => {
        expect(summariseOverdue([card(0, null)], NOW)).toEqual({
            amount: 0,
            currency: 'RUB',
            oldestDays: null,
        });
    });
});

describe('SettlementAdminResolver', () => {
    it('is gated by the credit right', () => {
        const permissions = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            SettlementAdminResolver.prototype.counterpartyOverdue,
        );
        expect(permissions).toContain(CustomPermission.ReadCounterpartyCredit.Permission);
    });

    it('answers null for a counterparty the caller cannot see and never reads the figures', async () => {
        const resolver = new SettlementAdminResolver(
            {
                overdue: async () => {
                    throw new Error('must not run');
                },
            } as never,
            { findOneVisible: async () => null } as never,
            {} as never,
            {} as never,
        );
        expect(await resolver.counterpartyOverdue({} as never, { counterpartyId: '1' })).toBeNull();
    });

    it('returns the summary for a visible counterparty', async () => {
        const summary = { amount: 5, currency: 'RUB', oldestDays: 3 };
        const resolver = new SettlementAdminResolver(
            { overdue: async () => summary } as never,
            { findOneVisible: async () => ({ id: 1 }) } as never,
            {} as never,
            {} as never,
        );
        expect(await resolver.counterpartyOverdue({} as never, { counterpartyId: '1' })).toEqual(
            summary,
        );
    });
});
