import { MigrationInterface, QueryRunner } from 'typeorm';

// #298: the New arrivals widget sorts by this expression on every home page open.
export class ProductNewArrivalIndex1791542000000 implements MigrationInterface {
    name = 'ProductNewArrivalIndex1791542000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_product_new_arrival_date" ON "product" ((COALESCE("customFieldsErpcreatedat", "createdAt")) DESC)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_product_new_arrival_date"`);
    }
}
