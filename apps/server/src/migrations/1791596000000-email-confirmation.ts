import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailConfirmation1791596000000 implements MigrationInterface {
    name = 'EmailConfirmation1791596000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "email_confirmation" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "uuid" uuid NOT NULL,
                "customerId" integer NOT NULL,
                "confirmedEmail" character varying,
                "pendingEmail" character varying,
                "token" character varying,
                CONSTRAINT "PK_email_confirmation" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2181d3f80e48f7dfb2d1c9f81a" ON "email_confirmation" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_7c0b0038080ecbe973d3190d11" ON "email_confirmation" ("customerId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_a73b8a19a0e282f9239d44dbaf" ON "email_confirmation" ("token")`,
        );
        await queryRunner.query(
            `INSERT INTO email_confirmation (uuid, "customerId", "confirmedEmail")
             SELECT gen_random_uuid(), c.id, lower(btrim(c."emailAddress"))
             FROM customer c JOIN "user" u ON u.id = c."userId"
             WHERE u.verified = true AND c."emailAddress" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "email_confirmation"`);
    }
}
