import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderSelectedContract1791447802494 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsSelectedcontractid" character varying`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsSelectedcontractid"`,
            undefined,
        );
    }
}
