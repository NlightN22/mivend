import { MigrationInterface, QueryRunner } from 'typeorm';

// #338: external sign-in requests, and one provider identity per administrator and per provider subject.
export class OidcSignIn1791569000000 implements MigrationInterface {
    name = 'OidcSignIn1791569000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "oidc_auth_request" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "stateHash" character varying NOT NULL, "nonce" character varying NOT NULL, "codeVerifier" character varying NOT NULL, "status" character varying NOT NULL, "userId" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_oidc_auth_request" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_oidc_auth_request_uuid" ON "oidc_auth_request" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_oidc_auth_request_state_hash" ON "oidc_auth_request" ("stateHash")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_authentication_method_oidc_subject" ON "authentication_method" ("externalIdentifier") WHERE "strategy" = 'oidc'`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_authentication_method_oidc_user" ON "authentication_method" ("userId") WHERE "strategy" = 'oidc'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_authentication_method_oidc_user"`);
        await queryRunner.query(`DROP INDEX "UQ_authentication_method_oidc_subject"`);
        await queryRunner.query(`DROP TABLE "oidc_auth_request"`);
    }
}
