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

// One ALTER per table: each statement rewrites the table once, not once per column.
async function retype(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
    const rows: Array<{ table_name: string; column_name: string }> = await queryRunner.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND data_type = $1`,
        [from],
    );
    const wanted = new Set(MONEY_COLUMNS.map(([table, column]) => `${table}.${column}`));
    const byTable = new Map<string, string[]>();
    for (const r of rows) {
        if (!wanted.has(`${r.table_name}.${r.column_name}`)) continue;
        byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), r.column_name]);
    }
    for (const [table, columns] of byTable) {
        const alters = columns.map(c => `ALTER COLUMN "${c}" TYPE ${to}`).join(', ');
        await queryRunner.query(`ALTER TABLE "${table}" ${alters}`);
    }
}

export class MoneyColumnsBigint1791605000000 implements MigrationInterface {
    name = 'MoneyColumnsBigint1791605000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await retype(queryRunner, 'integer', 'bigint');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await retype(queryRunner, 'bigint', 'integer');
    }
}
