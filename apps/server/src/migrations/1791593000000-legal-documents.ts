import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegalDocuments1791593000000 implements MigrationInterface {
    name = 'LegalDocuments1791593000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "legal_document_version" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "uuid" uuid NOT NULL,
                "kind" character varying NOT NULL,
                "version" integer NOT NULL,
                "locale" character varying NOT NULL,
                "title" character varying NOT NULL,
                "template" text NOT NULL,
                "body" text NOT NULL,
                "effectiveDate" TIMESTAMP WITH TIME ZONE NOT NULL,
                "requiresReacceptance" boolean NOT NULL,
                CONSTRAINT "PK_legal_document_version" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_02d322ec53f6807f4248868423" ON "legal_document_version" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9e5372a5fdf57bcdf5e702e30e" ON "legal_document_version" ("kind", "version", "locale")`,
        );
        await queryRunner.query(
            `CREATE TABLE "legal_acceptance" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "uuid" uuid NOT NULL,
                "customerId" integer NOT NULL,
                "kind" character varying NOT NULL,
                "version" integer NOT NULL,
                "accepted" boolean NOT NULL,
                "locale" character varying NOT NULL,
                "portal" character varying NOT NULL,
                "ip" character varying NOT NULL,
                "userAgent" character varying NOT NULL,
                CONSTRAINT "PK_legal_acceptance" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_6516a20d15514391d9db82662f" ON "legal_acceptance" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7d69b74da43c8ce913d11907e5" ON "legal_acceptance" ("customerId", "kind")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "legal_acceptance"`);
        await queryRunner.query(`DROP TABLE "legal_document_version"`);
    }
}
