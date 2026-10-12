import { createDbClient } from './db-client';
import { renameInvoiceToProformaInvoice } from './proforma-invoice-rename';

// synchronize would drop "invoice" and recreate an empty proforma_invoice (#223); production is
// migration-driven (1791488000000) and only checks that the table exists.
export async function carryOverProformaInvoice(): Promise<void> {
    const client = createDbClient();
    await client.connect();
    const exists = async (table: string, column?: string): Promise<boolean> => {
        const { rows } = column
            ? await client.query(
                  `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
                  [table, column],
              )
            : await client.query(
                  `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
                  [table],
              );
        return rows.length > 0;
    };
    try {
        if (process.env.NODE_ENV === 'production') {
            if ((await exists('invoice')) && !(await exists('proforma_invoice'))) {
                throw new Error(
                    'Table invoice has not been renamed: run migration:run (1791488000000-proforma-invoice-rename) before starting this process',
                );
            }
            return;
        }
        await client.query('BEGIN');
        // Runs before Vendure bootstraps, so there is no TransactionalConnection for withAggregateLock.
        await client.query(
            // eslint-disable-next-line locks/no-raw-advisory-lock
            `SELECT pg_advisory_xact_lock(hashtext('proforma-invoice-carryover'))`,
        );
        const renamed = await renameInvoiceToProformaInvoice(sql => client.query(sql), exists);
        await client.query('COMMIT');
        if (renamed) console.log('invoice table carried over to proforma_invoice');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
    } finally {
        await client.end();
    }
}
