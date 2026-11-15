import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { CounterpartyErp } from './entities/counterparty-erp.entity';

export type CounterpartyMirrorFields = Partial<
    Omit<CounterpartyErp, 'id' | 'erpId' | 'createdAt' | 'updatedAt'>
>;

// The only writer of counterparty_erp, called by the stream handler with exactly what the event carried.
@Injectable()
export class CounterpartyErpMirrorService {
    constructor(private readonly connection: TransactionalConnection) {}

    // undefined keeps the mirrored value (a partial event); null stores that the ERP sent it empty.
    async write(
        ctx: RequestContext,
        erpId: string,
        fields: CounterpartyMirrorFields,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, CounterpartyErp);
        const row = (await repo.findOne({ where: { erpId } })) ?? repo.create({ erpId });
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        await repo.save(row);
    }
}
