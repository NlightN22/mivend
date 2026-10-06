import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankAndBankAccountRecords1791000000011 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "bank_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "name" character varying NOT NULL, "bik" character varying NOT NULL, "correspondentAccount" character varying, "isActive" boolean NOT NULL DEFAULT false, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_bank_record_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bank_record_entity_id" ON "bank_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "bank_account_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "accountNumber" character varying NOT NULL, "bankId" character varying NOT NULL, "ownerId" character varying NOT NULL, "ownerType" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT false, "isDeleted" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "PK_bank_account_record_id" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bank_account_record_entity_id" ON "bank_account_record" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_bank_account_record_owner_id" ON "bank_account_record" ("ownerId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "bank_account_record"`, undefined);
        await queryRunner.query(`DROP TABLE "bank_record"`, undefined);
    }
}
