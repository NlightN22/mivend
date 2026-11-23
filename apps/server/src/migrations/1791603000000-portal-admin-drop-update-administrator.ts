import { MigrationInterface, QueryRunner } from 'typeorm';

export class PortalAdminDropUpdateAdministrator1791603000000 implements MigrationInterface {
    name = 'PortalAdminDropUpdateAdministrator1791603000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = array_to_string(array_remove(string_to_array("permissions", ','), 'UpdateAdministrator'), ',') WHERE "code" = 'portal-admin' AND "permissions" ~ '(^|,)UpdateAdministrator(,|$)'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "role" SET "permissions" = "permissions" || ',UpdateAdministrator' WHERE "code" = 'portal-admin' AND "permissions" !~ '(^|,)UpdateAdministrator(,|$)'`,
        );
    }
}
