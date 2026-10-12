import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn();

vi.mock('../../db-client', () => ({
    createDbClient: () => ({ connect: vi.fn(), query, end }),
}));

import { carryOverProformaInvoice } from '../../proforma-invoice-carryover';

function tablesPresent(...tables: string[]) {
    return (sql: string, params?: string[]) => {
        if (sql.includes('information_schema.tables')) {
            return Promise.resolve({ rows: tables.includes(params?.[0] ?? '') ? [{}] : [] });
        }
        return Promise.resolve({ rows: [] });
    };
}

describe('carryOverProformaInvoice', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        query.mockReset();
        end.mockReset();
    });

    it('fails production startup when the invoice table was not renamed', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        query.mockImplementation(tablesPresent('invoice'));

        await expect(carryOverProformaInvoice()).rejects.toThrow(/migration:run/);
        expect(end).toHaveBeenCalled();
    });

    it('renames the table on a synchronize contour', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        query.mockImplementation(tablesPresent('invoice'));

        await carryOverProformaInvoice();
        const sqls = query.mock.calls.map(c => String(c[0]));
        expect(sqls).toContain('ALTER TABLE "invoice" RENAME TO "proforma_invoice"');
        expect(sqls).toContain('COMMIT');
    });

    it('is a no-op once proforma_invoice exists', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        query.mockImplementation(tablesPresent('proforma_invoice'));

        await carryOverProformaInvoice();
        expect(query.mock.calls.map(c => String(c[0])).some(s => s.startsWith('ALTER'))).toBe(
            false,
        );
    });
});
