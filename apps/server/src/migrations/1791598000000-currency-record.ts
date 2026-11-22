import { MigrationInterface, QueryRunner } from 'typeorm';

export class CurrencyRecord1791598000000 implements MigrationInterface {
    name = 'CurrencyRecord1791598000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "currency_record" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "entityId" character varying NOT NULL,
                "code" character varying NOT NULL,
                "numericCode" character varying,
                "fullName" character varying,
                "isActive" boolean NOT NULL DEFAULT false,
                "isDeleted" boolean NOT NULL DEFAULT false,
                "id" SERIAL NOT NULL,
                CONSTRAINT "PK_db0af6cec3b23ecfcab64d49556" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8c475d39a1a6ccbf2dd374d71a" ON "currency_record" ("entityId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "currency_record"`);
    }
}
