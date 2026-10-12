export type SqlRunner = (sql: string) => Promise<unknown>;
export type TableProbe = (table: string, column?: string) => Promise<boolean>;

const INDEX_RENAMES: Array<[string, string]> = [
    ['IDX_f494ce6746b91e9ec9562af485', 'IDX_3c05e04d59dc94393085b59337'],
    ['IDX_60284980bc8b9c624459948f4a', 'IDX_f8d94b64d17a66ec2d7b71c741'],
    ['IDX_058ef835f99e28fc6717cd7c80', 'IDX_4329790dd0003c5c970aa729c0'],
    ['IDX_55c734c8f77040ed61ad02c6cd', 'IDX_54b478515751600782b459ebe8'],
    ['IDX_f6757552bd0776859af91c222c', 'IDX_595aee2281ace9b2a4fbd06328'],
    ['IDX_7465d595c3d205a1d09b71cb82', 'IDX_e16ed9eadfb67e95ec3659bd75'],
    ['IDX_invoice_uuid', 'IDX_proforma_invoice_uuid'],
    ['PK_15d25c200d9bcd8a33f698daf18', 'PK_1909c7d478de0e7c9790277d40a'],
];

const LINK_COLUMNS: Array<{ table: string; index?: [string, string] }> = [
    {
        table: 'payment_attempt',
        index: ['IDX_c553baf9e321b2a8129d0a4fde', 'IDX_d2f99d5da80dcd0802eadcd1f6'],
    },
    {
        table: 'settlement_entry',
        index: ['IDX_419e874af262dc90425c07aeee', 'IDX_f71ea5922db724609713b33db0'],
    },
    { table: 'payment_reconciliation_issue' },
    { table: 'document' },
];

// Idempotent: a no-op once "invoice" is gone, so the synchronize-contour carry-over and the migration can both run it.
export async function renameInvoiceToProformaInvoice(
    run: SqlRunner,
    exists: TableProbe,
): Promise<boolean> {
    if (!(await exists('invoice')) || (await exists('proforma_invoice'))) {
        return false;
    }
    await run(`ALTER TABLE "invoice" RENAME TO "proforma_invoice"`);
    await run(`ALTER SEQUENCE IF EXISTS "invoice_id_seq" RENAME TO "proforma_invoice_id_seq"`);
    for (const [from, to] of INDEX_RENAMES) {
        if (from.startsWith('PK_')) {
            await run(`ALTER TABLE "proforma_invoice" RENAME CONSTRAINT "${from}" TO "${to}"`);
        } else {
            await run(`ALTER INDEX IF EXISTS "${from}" RENAME TO "${to}"`);
        }
    }
    for (const { table, index } of LINK_COLUMNS) {
        if (await exists(table, 'invoiceId')) {
            await run(`ALTER TABLE "${table}" RENAME COLUMN "invoiceId" TO "proformaInvoiceId"`);
        }
        if (index) {
            await run(`ALTER INDEX IF EXISTS "${index[0]}" RENAME TO "${index[1]}"`);
        }
    }
    return true;
}

export async function revertProformaInvoiceRename(
    run: SqlRunner,
    exists: TableProbe,
): Promise<void> {
    if (!(await exists('proforma_invoice')) || (await exists('invoice'))) {
        return;
    }
    await run(`ALTER TABLE "proforma_invoice" RENAME TO "invoice"`);
    await run(`ALTER SEQUENCE IF EXISTS "proforma_invoice_id_seq" RENAME TO "invoice_id_seq"`);
    for (const [from, to] of INDEX_RENAMES) {
        if (from.startsWith('PK_')) {
            await run(`ALTER TABLE "invoice" RENAME CONSTRAINT "${to}" TO "${from}"`);
        } else {
            await run(`ALTER INDEX IF EXISTS "${to}" RENAME TO "${from}"`);
        }
    }
    for (const { table, index } of LINK_COLUMNS) {
        if (await exists(table, 'proformaInvoiceId')) {
            await run(`ALTER TABLE "${table}" RENAME COLUMN "proformaInvoiceId" TO "invoiceId"`);
        }
        if (index) {
            await run(`ALTER INDEX IF EXISTS "${index[1]}" RENAME TO "${index[0]}"`);
        }
    }
}
