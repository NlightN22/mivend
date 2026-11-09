import { describe, expect, it } from 'vitest';

import { resolveContactPoints } from '../../contact-point-normalize';
import { planContactPointReplace } from '../../contact-point-replace-plan';

const phone = (value: string, extra = {}) => ({ type: 'phone' as const, value, ...extra });

describe('resolveContactPoints', () => {
    it('normalizes a phone to E.164 and keeps the value as received', () => {
        const [p] = resolveContactPoints([phone('8 (912) 345-67-89', { label: ' Work ' })]);
        expect(p).toMatchObject({
            type: 'phone',
            value: '8 (912) 345-67-89',
            normalizedValue: '+79123456789',
            isUsable: true,
            label: 'Work',
        });
    });

    it('routes an e-mail held in a phone field by content', () => {
        const [p] = resolveContactPoints([phone('Buyer@Example.com')]);
        expect(p).toMatchObject({ type: 'email', normalizedValue: 'buyer@example.com' });
    });

    it('routes a phone held in an e-mail field by content', () => {
        const [p] = resolveContactPoints([{ type: 'email', value: '+7 912 345-67-89' }]);
        expect(p.type).toBe('phone');
    });

    it('keeps an unparseable phone visible but flags it unusable', () => {
        const [p] = resolveContactPoints([phone('call the office')]);
        expect(p).toMatchObject({ type: 'phone', normalizedValue: null, isUsable: false });
    });

    it('drops blank values and dedupes on type + normalized value, keeping any primary flag', () => {
        const rows = resolveContactPoints([
            phone('  '),
            phone('+7 912 345-67-89'),
            phone('89123456789', { isPrimary: true }),
            { type: 'address', value: 'Street  1' },
            { type: 'address', value: 'street 1' },
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[0].isPrimary).toBe(true);
    });
});

describe('planContactPointReplace', () => {
    const stored = (id: number, source: 'erp' | 'manual', n: string) => ({
        id,
        type: 'phone' as const,
        value: n,
        normalizedValue: n,
        source,
    });

    it('inserts new, updates matching (manual becomes erp), deletes vanished ERP rows, never manual', () => {
        const incoming = resolveContactPoints([phone('+79120000001'), phone('+79120000003')]);
        const plan = planContactPointReplace(
            [
                stored(1, 'erp', '+79120000001'),
                stored(2, 'erp', '+79120000002'),
                stored(3, 'manual', '+79120000003'),
                stored(4, 'manual', '+79120000004'),
            ],
            incoming,
        );
        expect(plan.update.map(u => u.id)).toEqual([1, 3]);
        expect(plan.deleteIds).toEqual([2]);
        expect(plan.insert).toEqual([]);
    });

    it('an empty incoming list deletes every ERP row and keeps manual ones', () => {
        const plan = planContactPointReplace(
            [stored(1, 'erp', '+79120000001'), stored(4, 'manual', '+79120000004')],
            [],
        );
        expect(plan.deleteIds).toEqual([1]);
    });
});
