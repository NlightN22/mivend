import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContractFile1791605000000 implements MigrationInterface {
    name = 'ContractFile1791605000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "contract_file" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "contractId" integer NOT NULL, "kind" character varying NOT NULL, "assetId" integer NOT NULL, "fileName" character varying NOT NULL, "uploadedByAdministratorId" character varying, CONSTRAINT "PK_eba10480b6eee563cf350bb6c6b" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_80403f3992288246ea46340c55" ON "contract_file" ("uuid") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_e831442301310cbb4afa35a893" ON "contract_file" ("contractId") `,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "contract_file"`);
    }
}
