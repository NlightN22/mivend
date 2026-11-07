import { MigrationInterface, QueryRunner } from 'typeorm';

// #320: per-role, per-product-group ceiling of a line discount; empty until an admin sets one.
export class DiscountLimit1791552000000 implements MigrationInterface {
    name = 'DiscountLimit1791552000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "discount_limit" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "roleCode" character varying NOT NULL, "groupRef" character varying NOT NULL DEFAULT '', "maxDiscountPercent" double precision NOT NULL, CONSTRAINT "PK_d8eb9ebbab54de33cf1f8edcc9f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_10e2d777f23bdeb2fa0fa660b1" ON "discount_limit" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_538d4f03d8db9cec179af4636e" ON "discount_limit" ("roleCode", "groupRef")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "discount_limit"`);
    }
}
