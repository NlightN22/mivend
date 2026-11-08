import { MigrationInterface, QueryRunner } from 'typeorm';

// #320: per-employee, per-product-scope ceiling of a line discount; empty until an admin sets one.
export class DiscountLimit1791559000000 implements MigrationInterface {
    name = 'DiscountLimit1791559000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "discount_limit" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "administratorId" character varying NOT NULL, "scopeKind" character varying NOT NULL DEFAULT 'all', "scopeRef" character varying NOT NULL DEFAULT '', "maxDiscountPercent" double precision NOT NULL, CONSTRAINT "PK_d8eb9ebbab54de33cf1f8edcc9f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_10e2d777f23bdeb2fa0fa660b1" ON "discount_limit" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_8d823c8315773dcb6d6dafabfb" ON "discount_limit" ("administratorId", "scopeKind", "scopeRef")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "discount_limit"`);
    }
}
