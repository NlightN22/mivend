import { describe, expect, it } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import {
    applyErpDocumentFilter,
    applyErpDocumentSort,
} from '../../erp-document-list/erp-document-list-query';

function fakeQb(): {
    qb: SelectQueryBuilder<object>;
    where: { sql: string; params: Record<string, unknown> }[];
    order: string[];
} {
    const where: { sql: string; params: Record<string, unknown> }[] = [];
    const order: string[] = [];
    const qb = {
        andWhere: (sql: string, params: Record<string, unknown>) => where.push({ sql, params }),
        orderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
        addOrderBy: (sql: string, dir: string) => order.push(`${sql} ${dir}`),
    } as unknown as SelectQueryBuilder<object>;
    return { qb, where, order };
}

describe('ERP document list query', () => {
    it('binds every value and keeps hostile text out of the SQL', () => {
        const { qb, where } = fakeQb();
        applyErpDocumentFilter('customerClaim', qb, {
            number: { contains: "1'; DROP TABLE x;--" },
            orderId: { eq: '7' },
        });
        expect(where).toHaveLength(1);
        expect(where[0].sql).not.toContain('DROP');
        expect(Object.values(where[0].params)).toEqual(["%1'; DROP TABLE x;--%", 7]);
    });

    it('rejects a non-numeric id and a field outside the whitelist', () => {
        expect(() =>
            applyErpDocumentFilter('salesCorrection', fakeQb().qb, { orderId: { eq: '1 OR 1=1' } }),
        ).toThrow();
        expect(() =>
            applyErpDocumentFilter('salesCorrection', fakeQb().qb, { bogus: { eq: 'x' } }),
        ).toThrow('Unknown filter');
    });

    it('offers the contract filter only where the document has a contract', () => {
        const filter = { contract: { contains: 'a' } };
        expect(() => applyErpDocumentFilter('customerClaim', fakeQb().qb, filter)).not.toThrow();
        expect(() => applyErpDocumentFilter('orderCorrection', fakeQb().qb, filter)).toThrow();
    });

    it('sorts newest first with the id as tie-break, and refuses unsortable columns', () => {
        const { qb, order } = fakeQb();
        applyErpDocumentSort('orderCorrection', qb, undefined);
        expect(order).toEqual(['"t"."date" DESC', '"t"."id" DESC']);
        expect(() =>
            applyErpDocumentSort('orderCorrection', fakeQb().qb, { comment: 'ASC' }),
        ).toThrow('Cannot sort by');
    });
});
