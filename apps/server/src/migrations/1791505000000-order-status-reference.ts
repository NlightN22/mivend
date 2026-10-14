import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStatusReference1791505000000 implements MigrationInterface {
    name = 'OrderStatusReference1791505000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "order_status_reference" (
                "id" SERIAL NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "code" character varying NOT NULL,
                "name" character varying NOT NULL,
                "rank" integer NOT NULL,
                "terminal" boolean NOT NULL DEFAULT false,
                "customerVisible" boolean NOT NULL DEFAULT false,
                "description" character varying NOT NULL DEFAULT '',
                "source" character varying NOT NULL DEFAULT 'erp',
                "customerGroup" character varying NOT NULL DEFAULT '',
                "warehouseStarted" boolean NOT NULL DEFAULT false,
                "shipped" boolean NOT NULL DEFAULT false,
                "delivered" boolean NOT NULL DEFAULT false,
                "cancelled" boolean NOT NULL DEFAULT false,
                "initial" boolean NOT NULL DEFAULT false,
                "submitted" boolean NOT NULL DEFAULT false,
                "rejected" boolean NOT NULL DEFAULT false,
                "reservationConfirmed" boolean NOT NULL DEFAULT false,
                "externalDefault" boolean NOT NULL DEFAULT false,
                "isDeleted" boolean NOT NULL DEFAULT false,
                "sourceVersion" character varying NOT NULL,
                CONSTRAINT "PK_order_status_reference" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_status_reference_code"
               ON "order_status_reference" ("code")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "order_status_reference"`);
    }
}
