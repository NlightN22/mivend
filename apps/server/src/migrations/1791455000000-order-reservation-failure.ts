import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderReservationFailure1791455000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsReservationfailurereason" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsReservationfailuredetail" text`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsReservationfailedat" TIMESTAMP`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsReservationfailedat"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsReservationfailuredetail"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN "customFieldsReservationfailurereason"`,
            undefined,
        );
    }
}
