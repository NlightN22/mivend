import { MigrationInterface, QueryRunner } from 'typeorm';

// #254: powers of attorney carried by contract events, stored as received.
export class ContractPowerOfAttorneyErp1791556000000 implements MigrationInterface {
    name = 'ContractPowerOfAttorneyErp1791556000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "contract_power_of_attorney_erp" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "contractId" character varying NOT NULL, "counterpartyId" character varying, "organizationId" character varying, "externalId" character varying, "number" character varying NOT NULL DEFAULT '', "holderName" character varying NOT NULL DEFAULT '', "issueDate" TIMESTAMP WITH TIME ZONE, "validUntil" TIMESTAMP WITH TIME ZONE, "scanId" character varying, "isDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_7cb6e8bc70f8f8caed884938f71" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_contract_power_of_attorney_erp_counterparty" ON "contract_power_of_attorney_erp" ("counterpartyId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_contract_power_of_attorney_erp_contract" ON "contract_power_of_attorney_erp" ("contractId") `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_contract_power_of_attorney_erp_counterparty"`);
        await queryRunner.query(`DROP INDEX "IDX_contract_power_of_attorney_erp_contract"`);
        await queryRunner.query(`DROP TABLE "contract_power_of_attorney_erp"`);
    }
}
