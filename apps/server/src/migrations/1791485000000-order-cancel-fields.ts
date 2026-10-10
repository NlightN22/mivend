import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderCancelFields1791485000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsCancelrequestedat" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsCancelreason" character varying(255)`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsCancelrequeststatus" character varying(255)`,
        );
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsCancelrefusalreason" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsCancelrefusalreason"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsCancelrequeststatus"`,
        );
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsCancelreason"`);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsCancelrequestedat"`);
    }
}
