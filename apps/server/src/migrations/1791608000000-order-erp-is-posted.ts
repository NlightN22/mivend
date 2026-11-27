import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpIsPosted1791608000000 implements MigrationInterface {
    name = 'OrderErpIsPosted1791608000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpisposted" boolean`);
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsErpstatusbeforeunposted" character varying(255)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsErpstatusbeforeunposted"`,
        );
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpisposted"`);
    }
}
