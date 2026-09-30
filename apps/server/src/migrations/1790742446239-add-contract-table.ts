import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue #105/#153: Contract (@mivend/plugin-counterparty) was never migrated — missing from
// baseline entirely. See docs/ai/erp-streams-map.md's `contract` row.
export class AddContractTable1790742446239 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "contract" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "erpId" character varying NOT NULL, "counterpartyId" character varying NOT NULL, "organizationId" character varying NOT NULL, "priceTypeId" character varying NOT NULL, "creditLimit" character varying, "currency" character varying, "isActive" boolean NOT NULL DEFAULT true, "controlledIndividually" boolean, "debtDaysLimit" integer, "name" character varying, "contractKind" character varying NOT NULL, "paymentKind" character varying, "paymentDelayDays" integer, "contractType" character varying NOT NULL, "brandManufacturerId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_17c3a89f58a2997276084e706e8" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e71603c40dd66c46151ef8af9f" ON "contract" ("erpId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_551e9be886700e880ebcaf9a12" ON "contract" ("counterpartyId") `,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_551e9be886700e880ebcaf9a12"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e71603c40dd66c46151ef8af9f"`, undefined);
        await queryRunner.query(`DROP TABLE "contract"`, undefined);
    }
}
