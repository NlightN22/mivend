import { MigrationInterface, QueryRunner } from 'typeorm';

// #251: the position belongs to the ERP user; no data carried over from the Administrator column.
export class ErpPosition1791524000000 implements MigrationInterface {
    name = 'ErpPosition1791524000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "position" RENAME TO "erp_position"`);
        await queryRunner.query(`ALTER SEQUENCE "position_id_seq" RENAME TO "erp_position_id_seq"`);
        await queryRunner.query(
            `ALTER TABLE "erp_position" RENAME CONSTRAINT "PK_b7f483581562b4dc62ae1a5b7e2" TO "PK_1b184edb3d628b36754a13608ff"`,
        );
        await queryRunner.query(
            `ALTER INDEX "IDX_4baa0461f36efe6c45985bf2d5" RENAME TO "IDX_76b76c93941a64b1d2de3ffdbf"`,
        );
        await queryRunner.query(`ALTER TABLE "erp_user" ADD "positionErpId" character varying`);
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFieldsPositionid"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "administrator" ADD "customFieldsPositionid" character varying(255)`,
        );
        await queryRunner.query(`ALTER TABLE "erp_user" DROP COLUMN "positionErpId"`);
        await queryRunner.query(
            `ALTER INDEX "IDX_76b76c93941a64b1d2de3ffdbf" RENAME TO "IDX_4baa0461f36efe6c45985bf2d5"`,
        );
        await queryRunner.query(
            `ALTER TABLE "erp_position" RENAME CONSTRAINT "PK_1b184edb3d628b36754a13608ff" TO "PK_b7f483581562b4dc62ae1a5b7e2"`,
        );
        await queryRunner.query(`ALTER SEQUENCE "erp_position_id_seq" RENAME TO "position_id_seq"`);
        await queryRunner.query(`ALTER TABLE "erp_position" RENAME TO "position"`);
    }
}
