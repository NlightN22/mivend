import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
    'invoice',
    'payment_attempt',
    'payment_refund',
    'settlement_entry',
    'discount_grant',
    'document',
    'erp_reconciliation_issue',
    'reservation',
];

export class PluginEntitiesUuid1791480000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const table of TABLES) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD "uuid" uuid`, undefined);
            await queryRunner.query(
                `UPDATE "${table}" SET "uuid" = gen_random_uuid() WHERE "uuid" IS NULL`,
                undefined,
            );
            await queryRunner.query(
                `ALTER TABLE "${table}" ALTER COLUMN "uuid" SET NOT NULL`,
                undefined,
            );
            await queryRunner.query(
                `CREATE UNIQUE INDEX "IDX_${table}_uuid" ON "${table}" ("uuid")`,
                undefined,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of TABLES) {
            await queryRunner.query(`DROP INDEX "IDX_${table}_uuid"`, undefined);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "uuid"`, undefined);
        }
    }
}
