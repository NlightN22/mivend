import { MigrationInterface, QueryRunner } from 'typeorm';

export class ManufacturerParent1791605000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "manufacturer" ADD "parentExternalId" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturer" DROP COLUMN "parentExternalId"`);
    }
}
