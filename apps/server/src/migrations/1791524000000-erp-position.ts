import { MigrationInterface, QueryRunner } from 'typeorm';

// #251: the position belongs to the ERP user; no data carried over from the Administrator column.
export class ErpPosition1791524000000 implements MigrationInterface {
    name = 'ErpPosition1791524000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "position" RENAME TO "erp_position"`);
        await queryRunner.query(`ALTER TABLE "erp_user" ADD "positionErpId" character varying`);
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFieldsPositionid"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "administrator" ADD "customFieldsPositionid" character varying(255)`,
        );
        await queryRunner.query(`ALTER TABLE "erp_user" DROP COLUMN "positionErpId"`);
        await queryRunner.query(`ALTER TABLE "erp_position" RENAME TO "position"`);
    }
}
