import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpReconciliationHealVerdict1791612500000 implements MigrationInterface {
    name = 'ErpReconciliationHealVerdict1791612500000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "erp_reconciliation_state" ADD "healVerdictPending" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "erp_reconciliation_state" DROP COLUMN "healVerdictPending"`,
        );
    }
}
