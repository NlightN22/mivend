import { MigrationInterface, QueryRunner } from 'typeorm';

// #320: team-wide table views, a per-list team default, and the mivend uuid every created entity carries.
export class SharedTableViews1791551000000 implements MigrationInterface {
    name = 'SharedTableViews1791551000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "saved_table_view" ADD "uuid" uuid NOT NULL DEFAULT gen_random_uuid()`,
        );
        await queryRunner.query(`ALTER TABLE "saved_table_view" ALTER COLUMN "uuid" DROP DEFAULT`);
        await queryRunner.query(
            `ALTER TABLE "saved_table_view" ADD "scope" character varying NOT NULL DEFAULT 'PERSONAL'`,
        );
        await queryRunner.query(
            `ALTER TABLE "saved_table_view" ADD "isDefault" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_36df118bbc2832e977c5289eaf" ON "saved_table_view" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_670bfd6d924f81b9e25ab7533b" ON "saved_table_view" ("scope", "pageKey")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_227aa8a5181cd72de5e6e4894a" ON "saved_table_view" ("pageKey") WHERE "isDefault" = true`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_227aa8a5181cd72de5e6e4894a"`);
        await queryRunner.query(`DROP INDEX "IDX_670bfd6d924f81b9e25ab7533b"`);
        await queryRunner.query(`DROP INDEX "IDX_36df118bbc2832e977c5289eaf"`);
        await queryRunner.query(`ALTER TABLE "saved_table_view" DROP COLUMN "isDefault"`);
        await queryRunner.query(`ALTER TABLE "saved_table_view" DROP COLUMN "scope"`);
        await queryRunner.query(`ALTER TABLE "saved_table_view" DROP COLUMN "uuid"`);
    }
}
