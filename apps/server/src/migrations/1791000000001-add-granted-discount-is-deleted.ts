import { MigrationInterface, QueryRunner } from 'typeorm';

// search-platform#147: soft-delete flag for 1C unposting tombstones on granted_discount.
export class AddGrantedDiscountIsDeleted1791000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "granted_discount" ADD "isDeleted" boolean NOT NULL DEFAULT false`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "granted_discount" DROP COLUMN "isDeleted"`,
            undefined,
        );
    }
}
