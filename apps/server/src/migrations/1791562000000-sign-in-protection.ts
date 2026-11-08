import { MigrationInterface, QueryRunner } from 'typeorm';

// #278: sign-in failure counters and the forced-password-change flag set by the breached-password check.
export class SignInProtection1791562000000 implements MigrationInterface {
    name = 'SignInProtection1791562000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "sign_in_throttle" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "key" character varying NOT NULL, "failures" integer NOT NULL DEFAULT '0', "lastFailureAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f5e2cc35dc896d5472604048ece" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d820671a05f4dfc60f90591ec6" ON "sign_in_throttle" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f838c82d37e24773fc7984a764" ON "sign_in_throttle" ("key")`,
        );
        await queryRunner.query(
            `ALTER TABLE "user" ADD "customFieldsPasswordchangerequired" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user" DROP COLUMN "customFieldsPasswordchangerequired"`,
        );
        await queryRunner.query(`DROP TABLE "sign_in_throttle"`);
    }
}
