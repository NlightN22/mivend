import { describe, expect, it } from 'vitest';

import {
    STATUS_SQL,
    DISCOUNT_SETUP_STATUSES,
    computeSetupStatus,
    setupOrderBy,
} from '../../discount-setup-list.types';

const now = new Date('2026-06-01T00:00:00Z');
const day = 24 * 3600 * 1000;
const base = {
    active: true,
    inactiveReason: null,
    validFrom: new Date(now.getTime() - 10 * day),
    validTo: null as Date | null,
};

describe('computeSetupStatus', () => {
    it('is running when open-ended or ending beyond the expiring-soon window', () => {
        expect(computeSetupStatus(base, now)).toBe('running');
        expect(
            computeSetupStatus({ ...base, validTo: new Date(now.getTime() + 90 * day) }, now),
        ).toBe('running');
    });

    it('is expiring-soon inside the window and expired once validTo has passed', () => {
        expect(
            computeSetupStatus({ ...base, validTo: new Date(now.getTime() + 3 * day) }, now),
        ).toBe('expiring-soon');
        expect(computeSetupStatus({ ...base, validTo: new Date(now.getTime() - day) }, now)).toBe(
            'expired',
        );
    });

    it('is upcoming before validFrom', () => {
        expect(computeSetupStatus({ ...base, validFrom: new Date(now.getTime() + day) }, now)).toBe(
            'upcoming',
        );
    });

    it('is inactive when not active or carrying a reason, whatever the dates', () => {
        expect(computeSetupStatus({ ...base, active: false }, now)).toBe('inactive');
        expect(computeSetupStatus({ ...base, inactiveReason: 'cancelled' }, now)).toBe('inactive');
        expect(
            computeSetupStatus(
                {
                    ...base,
                    inactiveReason: 'no-header-percent',
                    validTo: new Date(now.getTime() - day),
                },
                now,
            ),
        ).toBe('inactive');
    });
});

describe('status SQL', () => {
    it('has one predicate per status', () => {
        expect(Object.keys(STATUS_SQL).sort()).toEqual([...DISCOUNT_SETUP_STATUSES].sort());
    });
});

describe('setupOrderBy', () => {
    it('defaults to validFrom descending then id descending', () => {
        expect(setupOrderBy(undefined)).toEqual([
            ['s."validFrom"', 'DESC'],
            ['s."id"', 'DESC'],
        ]);
    });

    it('maps a whitelisted field and direction, keeping the id tiebreak', () => {
        expect(setupOrderBy({ field: 'percent', direction: 'ASC' })).toEqual([
            ['s."percent"', 'ASC'],
            ['s."id"', 'DESC'],
        ]);
    });

    it('never passes an unknown field into SQL', () => {
        const hostile = { field: 'id; DROP TABLE x', direction: 'ASC' } as never;
        expect(setupOrderBy(hostile)[0][0]).toBe('s."validFrom"');
    });
});
