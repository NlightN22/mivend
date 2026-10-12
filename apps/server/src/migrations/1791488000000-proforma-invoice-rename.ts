import { MigrationInterface, QueryRunner } from 'typeorm';

import {
    renameInvoiceToProformaInvoice,
    revertProformaInvoiceRename,
} from '../proforma-invoice-rename';

// Frees the name "invoice" for the ERP sales invoice (#223); rows and identity are untouched.
export class ProformaInvoiceRename1791488000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await renameInvoiceToProformaInvoice(
            sql => queryRunner.query(sql),
            (table, column) => exists(queryRunner, table, column),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await revertProformaInvoiceRename(
            sql => queryRunner.query(sql),
            (table, column) => exists(queryRunner, table, column),
        );
    }
}

async function exists(queryRunner: QueryRunner, table: string, column?: string): Promise<boolean> {
    const rows: unknown[] = column
        ? await queryRunner.query(
              `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
              [table, column],
          )
        : await queryRunner.query(
              `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
              [table],
          );
    return rows.length > 0;
}
