import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchSettingsPackagesOnly1791483000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" RENAME COLUMN "allowPiecewiseSale" TO "packagesOnly"`,
        );
        await queryRunner.query(`UPDATE "branch_settings" SET "packagesOnly" = NOT "packagesOnly"`);
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ALTER COLUMN "packagesOnly" SET DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ALTER COLUMN "packagesOnly" SET DEFAULT true`,
        );
        await queryRunner.query(`UPDATE "branch_settings" SET "packagesOnly" = NOT "packagesOnly"`);
        await queryRunner.query(
            `ALTER TABLE "branch_settings" RENAME COLUMN "packagesOnly" TO "allowPiecewiseSale"`,
        );
    }
}
