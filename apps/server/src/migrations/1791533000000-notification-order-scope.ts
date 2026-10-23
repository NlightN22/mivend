import { MigrationInterface, QueryRunner } from 'typeorm';

// #263: a broadcast about an order is visible only to administrators who see that order.
export class NotificationOrderScope1791533000000 implements MigrationInterface {
    name = 'NotificationOrderScope1791533000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" ADD "orderId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "orderId"`);
    }
}
