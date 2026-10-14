import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationDaysDefault1791506000000 implements MigrationInterface {
    name = 'ReservationDaysDefault1791506000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ALTER COLUMN "customFieldsReservationdays" SET DEFAULT '3'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ALTER COLUMN "customFieldsReservationdays" SET DEFAULT '7'`,
        );
    }
}
