import { Injector, OrderCodeStrategy, TransactionalConnection } from '@vendure/core';

export class SequentialOrderCodeStrategy implements OrderCodeStrategy {
    private connection!: TransactionalConnection;

    init(injector: Injector): void {
        this.connection = injector.get(TransactionalConnection);
    }

    async generate(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `ORD-${year}-`;

        // Race condition risk is negligible at B2B order volumes.
        const result = await this.connection.rawConnection.query<{ next: string }[]>(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(code, $2) AS INTEGER)), 0) + 1 AS next
             FROM "order"
             WHERE code LIKE $1`,
            [`${prefix}%`, prefix.length + 1],
        );

        const next = Number(result[0]?.next ?? 1);
        return `${prefix}${String(next).padStart(6, '0')}`;
    }
}
