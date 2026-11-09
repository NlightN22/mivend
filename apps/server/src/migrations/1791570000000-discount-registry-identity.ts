import { MigrationInterface, QueryRunner } from 'typeorm';

// A registry entry (a discount request through its life) gets a uuid and the human number its grant keeps.
export class DiscountRegistryIdentity1791570000000 implements MigrationInterface {
    name = 'DiscountRegistryIdentity1791570000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const code = process.env.INSTANCE_NUMBER_CODE;
        if (!code || !/^\d{3}$/.test(code)) {
            throw new Error('INSTANCE_NUMBER_CODE must be exactly 3 digits to number old entries');
        }
        const table = '"discount_registry_entry"';
        await queryRunner.query(`ALTER TABLE ${table} ADD "uuid" uuid`);
        await queryRunner.query(`ALTER TABLE ${table} ADD "number" character varying`);
        await queryRunner.query(`UPDATE ${table} SET "uuid" = gen_random_uuid()`);
        await queryRunner.query(
            `UPDATE ${table} e SET "number" = g."number" FROM "discount_grant" g
             WHERE g."sourceApprovalRequestId" = e."approvalRequestId"`,
        );
        await queryRunner.query(
            `UPDATE ${table} SET "number" = $1 || lpad(nextval('mivend_number_seq_discount_grant')::text, 7, '0')
             WHERE "number" IS NULL`,
            [code],
        );
        await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN "uuid" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN "number" SET NOT NULL`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_discount_registry_entry_uuid" ON ${table} ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_discount_registry_entry_number" ON ${table} ("number")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_discount_registry_entry_number"`);
        await queryRunner.query(`DROP INDEX "IDX_discount_registry_entry_uuid"`);
        await queryRunner.query(`ALTER TABLE "discount_registry_entry" DROP COLUMN "number"`);
        await queryRunner.query(`ALTER TABLE "discount_registry_entry" DROP COLUMN "uuid"`);
    }
}
