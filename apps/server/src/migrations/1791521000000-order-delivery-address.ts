import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderDeliveryAddress1791521000000 implements MigrationInterface {
    name = 'OrderDeliveryAddress1791521000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsDeliveryaddress" text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsDeliveryaddress"`,
        );
    }
}
