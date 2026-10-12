import { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { ProformaInvoicePersistedKeys1791490000000 } from '../../migrations/1791490000000-proforma-invoice-persisted-keys';

function runner(): { qr: QueryRunner; sql: string[] } {
    const sql: string[] = [];
    const qr = { query: vi.fn(async (q: string) => void sql.push(q)) } as unknown as QueryRunner;
    return { qr, sql };
}

describe('ProformaInvoicePersistedKeys migration', () => {
    it('renames the document type, sequence, permission and access-scope key', async () => {
        const { qr, sql } = runner();
        await new ProformaInvoicePersistedKeys1791490000000().up(qr);
        const all = sql.join('\n');
        expect(all).toContain(`SET "type" = 'proforma-invoice' WHERE "type" = 'invoice'`);
        expect(all).toContain(
            '"mivend_number_seq_invoice" RENAME TO "mivend_number_seq_proforma_invoice"',
        );
        expect(all).toContain(`'ReadProformaInvoice'`);
        expect(all).toContain(`'"proformaInvoice":'`);
    });

    it('down restores the legacy keys', async () => {
        const { qr, sql } = runner();
        await new ProformaInvoicePersistedKeys1791490000000().down(qr);
        const all = sql.join('\n');
        expect(all).toContain(`SET "type" = 'invoice' WHERE "type" = 'proforma-invoice'`);
        expect(all).toContain('RENAME TO "mivend_number_seq_invoice"');
        expect(all).toContain(`'ReadInvoice'`);
    });
});
