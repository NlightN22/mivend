import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementTurnoverDaily1791591000000 implements MigrationInterface {
    name = 'SettlementTurnoverDaily1791591000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "settlement_turnover_daily" (
                "counterpartyErpId" character varying NOT NULL,
                "day" date NOT NULL,
                "currency" character varying NOT NULL,
                "turnoverMinor" bigint NOT NULL,
                "saleDocuments" integer NOT NULL,
                CONSTRAINT "PK_settlement_turnover_daily" PRIMARY KEY ("counterpartyErpId", "day", "currency")
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_settlement_turnover_daily_day" ON "settlement_turnover_daily" ("day")`,
        );
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await queryRunner.query(
            `INSERT INTO settlement_turnover_daily ("counterpartyErpId", day, currency, "turnoverMinor", "saleDocuments")
             SELECT e."counterpartyErpId", (d.date AT TIME ZONE $1)::date, e.currency,
                 SUM(e."amountMinor"), COUNT(DISTINCT d.id) FILTER (WHERE t.category = 'sale')
             FROM settlement_document_entry e
             JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
             JOIN settlement_document_type t ON t."documentType" = d."documentType"
                 AND NOT t."isDeleted" AND t."movesTurnover"
             GROUP BY 1, 2, 3`,
            [tz],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "settlement_turnover_daily"`);
    }
}
