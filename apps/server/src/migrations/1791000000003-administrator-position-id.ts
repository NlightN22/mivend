import { MigrationInterface, QueryRunner } from 'typeorm';

// The free-text position can't be mapped to a Position.erpId, so it is dropped, not renamed.
export class AdministratorPositionId1791000000003 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "administrator" DROP COLUMN "customFieldsPosition"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator" ADD "customFieldsPositionid" character varying(255)`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "administrator" DROP COLUMN "customFieldsPositionid"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "administrator" ADD "customFieldsPosition" character varying(255)`,
            undefined,
        );
    }
}
