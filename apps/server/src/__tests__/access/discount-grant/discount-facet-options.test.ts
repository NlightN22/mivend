import { expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';

const QUERY = `{ discountFacetOptions { code name values { code name } } }`;
const STOCK = `{ facets(options: { take: 100 }) { items { code values { code } } } }`;

type Lean = { discountFacetOptions: { code: string; values: { code: string }[] }[] };
type Stock = { facets: { items: { code: string; values: { code: string }[] }[] } };

for (const actor of ['manager-a', 'superadmin'] as const) {
    it(`${actor}: the lean facet options match the stock facets list`, async () => {
        const token = await staffToken(actor);
        const lean = await admin<Lean>(token, QUERY);
        expect(lean.errors).toEqual([]);
        const stock = await admin<Stock>(token, STOCK);
        const expected = stock.data!.facets.items.map(f => ({
            code: f.code,
            values: f.values.map(v => v.code).sort(),
        }));
        const actual = lean.data!.discountFacetOptions.map(f => ({
            code: f.code,
            values: f.values.map(v => v.code).sort(),
        }));
        expect(actual.sort((a, b) => a.code.localeCompare(b.code))).toEqual(
            expected.sort((a, b) => a.code.localeCompare(b.code)),
        );
    });
}
