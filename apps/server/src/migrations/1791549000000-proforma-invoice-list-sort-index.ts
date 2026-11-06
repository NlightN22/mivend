import { MigrationInterface, QueryRunner } from 'typeorm';

// #311: the manager list sorts by (createdAt DESC, id DESC); without this index every page sorts the whole scoped set.
export class ProformaInvoiceListSortIndex1791549000000 implements MigrationInterface {
    name = 'ProformaInvoiceListSortIndex1791549000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_proforma_invoice_created_at_id" ON "proforma_invoice" ("createdAt" DESC, "id" DESC)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_proforma_invoice_created_at_id"`);
    }
}
