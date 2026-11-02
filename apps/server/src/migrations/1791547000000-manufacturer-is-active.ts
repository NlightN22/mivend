import { MigrationInterface, QueryRunner } from 'typeorm';

export class ManufacturerIsActive1791547000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "manufacturer" ADD "isActive" boolean NOT NULL DEFAULT true`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturer" DROP COLUMN "isActive"`);
    }
}
