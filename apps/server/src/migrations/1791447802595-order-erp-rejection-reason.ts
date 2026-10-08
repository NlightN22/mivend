import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpRejectionReason1791447802595 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsErprejectionreasoncode" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsErprejectionreasontext" character varying`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsErprejectionreasontext"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsErprejectionreasoncode"`,
            undefined,
        );
    }
}
