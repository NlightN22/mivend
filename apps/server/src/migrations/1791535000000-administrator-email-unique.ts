import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdministratorEmailUnique1791535000000 implements MigrationInterface {
    name = 'AdministratorEmailUnique1791535000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const duplicates: Array<{ emailAddress: string; ids: string }> = await queryRunner.query(
            `SELECT "emailAddress", string_agg("id"::text, ',' ORDER BY "id") AS "ids" FROM "administrator"
             WHERE "deletedAt" IS NULL GROUP BY "emailAddress" HAVING count(*) > 1`,
        );
        if (duplicates.length > 0) {
            const list = duplicates
                .map(d => `${d.emailAddress} (administrator ids ${d.ids})`)
                .join('; ');
            throw new Error(
                `Duplicate administrators: ${list}. Remove the extra accounts by hand first, see docs/deployment.md "First boot and duplicate superadmin".`,
            );
        }
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_administrator_email_active" ON "administrator" ("emailAddress") WHERE "deletedAt" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_administrator_email_active"`);
    }
}
