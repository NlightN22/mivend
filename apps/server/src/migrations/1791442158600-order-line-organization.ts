import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderLineOrganization1791442158600 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD "customFieldsOrganizationid" integer`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP COLUMN "customFieldsOrganizationid"`,
            undefined,
        );
    }
}
