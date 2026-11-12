import { describe, expect, it } from 'vitest';

import { admin, DENIED, staffToken } from '../harness/actors';
import { STAFF, VISIBLE_COUNTERPARTIES, type ActorKey } from '../seed/fixture-plan';
import { ALL_KEYS, idOf } from './counterparty-queries';

const METRICS = `query($id: ID!) { counterpartyMetrics(counterpartyId: $id) {
    balanceMinor openOrdersCount salesLast30DaysMinor computedAt } }`;

describe('counterpartyMetrics follows the credit right and the counterparty scope', () => {
    it.each(STAFF.map(s => s.key))(
        '%s gets figures only for a counterparty it can see',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            for (const counterparty of ALL_KEYS) {
                const result = await admin<{ counterpartyMetrics: { computedAt: string } | null }>(
                    token,
                    METRICS,
                    { id: idOf(counterparty) },
                );
                if (result.errors.length) {
                    for (const e of result.errors) expect(e).toMatch(DENIED);
                    continue;
                }
                expect(result.data!.counterpartyMetrics !== null, `${key} -> ${counterparty}`).toBe(
                    VISIBLE_COUNTERPARTIES[key].includes(counterparty),
                );
            }
        },
    );

    it('the all-scope director gets figures for every counterparty', async () => {
        const token = await staffToken('director');
        for (const counterparty of ALL_KEYS) {
            const result = await admin<{ counterpartyMetrics: unknown }>(token, METRICS, {
                id: idOf(counterparty),
            });
            expect(result.errors).toEqual([]);
            expect(result.data!.counterpartyMetrics).not.toBeNull();
        }
    });

    it('is refused without a staff session', async () => {
        const result = await admin(undefined as unknown as string, METRICS, { id: '1' });
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
