import { describe, expect, it } from 'vitest';

import { admin, customerToken, seed, shop, staffToken } from '../harness/actors';
import { SALES_DOC_EMPLOYEE_ID, SALES_DOC_NUMBERS as N } from '../seed/fixture-plan';

const FIELDS = `lineChanges { events { kind documentNumber quantity } }`;
const SHOP = `query($c: String!) { orderByCode(code: $c) { id ${FIELDS} } }`;
const ADMIN = `query($id: ID!) { order(id: $id) { id ${FIELDS} soldTotalWithTax } }`;

type Changes = { lineChanges: { events: { kind: string; documentNumber: string }[] }[] };

const numbers = (order: Changes | null | undefined): string[] =>
    (order?.lineChanges ?? []).flatMap(l => l.events.map(e => e.documentNumber)).sort();

const orderA = (): { id: string; code: string } => seed().ordering.orders['a-own'];
const orderB = (): { id: string; code: string } => seed().ordering.orders['b-own'];

describe('ERP sales documents on the order card follow the order scope and the accounting rule', () => {
    it('the owner customer sees only posted, unmarked, undeleted and linked documents', async () => {
        const r = await shop<{ orderByCode: Changes }>(await customerToken('customer-a'), SHOP, {
            c: orderA().code,
        });
        expect(r.errors).toEqual([]);
        expect(numbers(r.data!.orderByCode)).toEqual([N.picking, N.picked, N.returnPosted].sort());
        expect(JSON.stringify(r)).not.toContain(SALES_DOC_EMPLOYEE_ID);
    });

    it("another customer never gets a foreign order's documents", async () => {
        const r = await shop<{ orderByCode: Changes | null }>(
            await customerToken('customer-b'),
            SHOP,
            { c: orderA().code },
        );
        expect(numbers(r.data?.orderByCode)).toEqual([]);
        const own = await shop<{ orderByCode: Changes }>(await customerToken('customer-b'), SHOP, {
            c: orderB().code,
        });
        expect(numbers(own.data!.orderByCode)).toEqual([N.foreignPicking]);
    });

    it('staff see posted, unposted and marked documents but never deleted or unlinked ones', async () => {
        const r = await admin<{ order: Changes }>(await staffToken('director'), ADMIN, {
            id: orderA().id,
        });
        expect(r.errors).toEqual([]);
        expect(numbers(r.data!.order)).toEqual(
            [N.picking, N.picked, N.returnPosted, N.returnUnposted, N.returnMarked].sort(),
        );
        expect(JSON.stringify(r)).not.toContain(SALES_DOC_EMPLOYEE_ID);
    });
});
