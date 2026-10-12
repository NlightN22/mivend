import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchSettingsPrepaymentReserveDays1791492000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD COLUMN "prepaymentReserveDays" integer NOT NULL DEFAULT 3`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" DROP COLUMN "prepaymentReserveDays"`,
        );
    }
}
