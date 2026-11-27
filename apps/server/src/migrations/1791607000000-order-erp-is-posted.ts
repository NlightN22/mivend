import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpIsPosted1791607000000 implements MigrationInterface {
    name = 'OrderErpIsPosted1791607000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpisposted" boolean`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpisposted"`);
    }
}
