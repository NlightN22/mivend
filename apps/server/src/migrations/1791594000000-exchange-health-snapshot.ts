import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExchangeHealthSnapshot1791594000000 implements MigrationInterface {
    name = 'ExchangeHealthSnapshot1791594000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "exchange_health_snapshot" (
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "id" SERIAL NOT NULL,
                "key" character varying NOT NULL,
                "state" character varying NOT NULL,
                "reason" character varying,
                "health" jsonb,
                "polledAt" TIMESTAMP NOT NULL,
                CONSTRAINT "PK_d8f37908a2cb9651f1744efa278" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_87001cd6cb4d563aa45467be9e" ON "exchange_health_snapshot" ("key")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "exchange_health_snapshot"`);
    }
}
