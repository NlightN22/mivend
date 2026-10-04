import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchSettingsWarehouseNullable1791000000005 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ALTER COLUMN "defaultWarehouseId" DROP NOT NULL`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ALTER COLUMN "defaultWarehouseId" SET NOT NULL`,
            undefined,
        );
    }
}
