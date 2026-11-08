import { MigrationInterface, QueryRunner } from 'typeorm';

// #279: second-factor state (encrypted TOTP secrets) and the hashed sign-in challenge / recovery tokens.
export class TwoFactor1791559000000 implements MigrationInterface {
    name = 'TwoFactor1791559000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "two_factor_factor" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "userId" character varying NOT NULL, "method" character varying NOT NULL DEFAULT 'totp', "status" character varying NOT NULL, "secretEncrypted" text NOT NULL, "lastUsedStep" bigint, "pendingExpiresAt" TIMESTAMP, "activatedAt" TIMESTAMP, CONSTRAINT "PK_353c37acd054fb058940dd4071f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8860b78272c3e0a96bafede4e7" ON "two_factor_factor" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f399bc9f21d9ec54dc9c8ca159" ON "two_factor_factor" ("userId") WHERE "status" = 'active'`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_a12110e6d9fbbb264469719b51" ON "two_factor_factor" ("userId") WHERE "status" = 'pending'`,
        );
        await queryRunner.query(
            `CREATE TABLE "two_factor_token" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "tokenHash" character varying NOT NULL, "purpose" character varying NOT NULL, "userId" character varying NOT NULL, "stage" character varying, "apiType" character varying, "expiresAt" TIMESTAMP NOT NULL, "usedAt" TIMESTAMP, "attempts" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_69711e3fd92b70ca33436189ef7" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_2c9cf94f454c85a9620a47f620" ON "two_factor_token" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_01f2a055c3f7ccd5e686d6c82b" ON "two_factor_token" ("tokenHash")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "two_factor_token"`);
        await queryRunner.query(`DROP TABLE "two_factor_factor"`);
    }
}
