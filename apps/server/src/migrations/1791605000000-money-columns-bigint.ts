import { MigrationInterface, QueryRunner } from 'typeorm';

// Every column Vendure's @Money() decorator maps in 3.7.x; BigIntMoneyStrategy makes them bigint (#400).
const MONEY_COLUMNS: Array<[string, string]> = [
    ['order', 'subTotal'],
    ['order', 'subTotalWithTax'],
    ['order', 'shipping'],
    ['order', 'shippingWithTax'],
    ['order_line', 'listPrice'],
    ['order_line', 'initialListPrice'],
    ['shipping_line', 'listPrice'],
    ['surcharge', 'listPrice'],
    ['order_modification', 'priceChange'],
    ['payment', 'amount'],
    ['refund', 'items'],
    ['refund', 'shipping'],
    ['refund', 'adjustment'],
    ['refund', 'total'],
    ['product_variant_price', 'price'],
    ['search_index_item', 'price'],
    ['search_index_item', 'priceWithTax'],
];

const retype = (from: string, to: string): string => `
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT t.table_name, t.column_name
    FROM information_schema.columns t
    JOIN (VALUES ${MONEY_COLUMNS.map(([table, column]) => `('${table}', '${column}')`).join(', ')}) AS m(tbl, col)
      ON m.tbl = t.table_name AND m.col = t.column_name
    WHERE t.table_schema = current_schema() AND t.data_type = '${from}'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE ${to}', c.table_name, c.column_name);
  END LOOP;
END $$`;

export class MoneyColumnsBigint1791605000000 implements MigrationInterface {
    name = 'MoneyColumnsBigint1791605000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(retype('integer', 'bigint'));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(retype('bigint', 'integer'));
    }
}
