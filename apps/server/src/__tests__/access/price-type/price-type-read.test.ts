import { describe, expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import { ALLOWED_PRICE_TYPES, PRICE_TYPES, type ActorKey } from '../seed/fixture-plan';

const LISTS = `{ priceTypes { code visibility } priceTypeCodes }`;
const ALL_CODES = Object.values(PRICE_TYPES);

interface Lists {
    priceTypes: { code: string; visibility: string }[];
    priceTypeCodes: string[];
}

async function lists(token: string): Promise<Lists> {
    const result = await admin<Lists>(token, LISTS);
    expect(result.errors).toEqual([]);
    return result.data!;
}

const ours = (codes: string[]): string[] =>
    codes.filter(c => ALL_CODES.includes(c as never)).sort();

describe.each(Object.keys(ALLOWED_PRICE_TYPES) as ActorKey[])('price type lists for %s', key => {
    const allowed = [...ALLOWED_PRICE_TYPES[key]!].sort();

    it('Admin API price type lists hold exactly the allowed codes, all customer types', async () => {
        const got = await lists(await staffToken(key));
        expect(got.priceTypes.map(t => t.code).sort()).toEqual(allowed);
        expect([...got.priceTypeCodes].sort()).toEqual(allowed);
        expect(got.priceTypes.every(t => t.visibility === 'customer')).toBe(true);
    });

    it('the hidden and confidential types exist, so their absence is not an empty table', async () => {
        const all = await lists(await staffToken('superadmin'));
        expect(ours(all.priceTypes.map(t => t.code))).toEqual([...ALL_CODES].sort());
        const hidden = ALL_CODES.filter(c => !allowed.includes(c));
        expect(hidden.length).toBeGreaterThan(0);
        expect(all.priceTypes.find(t => t.code === PRICE_TYPES.purchase)?.visibility).toBe(
            'confidential',
        );
    });
});

it('a role reading every type sees the customer and the confidential types', async () => {
    const got = await lists(await staffToken('head-a'));
    expect(ours(got.priceTypes.map(t => t.code))).toEqual([...ALL_CODES].sort());
});
