import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchSettingsEnforceMultiplicity1791486000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "branch_settings" ADD COLUMN "enforceMultiplicity" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "branch_settings" DROP COLUMN "enforceMultiplicity"`);
    }
}
