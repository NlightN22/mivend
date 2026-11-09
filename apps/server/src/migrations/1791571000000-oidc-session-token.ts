import { MigrationInterface, QueryRunner } from 'typeorm';

// #338: the provider ID token of an administrator, kept as the hint for ending the provider session on sign-out.
export class OidcSessionToken1791571000000 implements MigrationInterface {
    name = 'OidcSessionToken1791571000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "oidc_session_token" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "userId" integer NOT NULL, "idToken" text NOT NULL, CONSTRAINT "PK_309f79522a63bbae6e298e1d83f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_3ca62ad445a9ab10a6a9546785" ON "oidc_session_token" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_abb6ad02c4364e4cbbaf126141" ON "oidc_session_token" ("userId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "oidc_session_token"`);
    }
}
