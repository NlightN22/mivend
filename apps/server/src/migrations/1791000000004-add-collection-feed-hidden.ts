import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionFeedHidden1791000000004 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "collection" ADD "customFieldsFeedhidden" boolean NOT NULL DEFAULT false`,
            undefined,
        );
        // Before this column, isPrivate was driven by the feed alone (plus manual overrides).
        await queryRunner.query(
            `UPDATE "collection" SET "customFieldsFeedhidden" = "isPrivate"`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "collection" DROP COLUMN "customFieldsFeedhidden"`,
            undefined,
        );
    }
}
