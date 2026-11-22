import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { CurrencyRecord } from './entities/currency-record.entity';
import { MissingDependencyError } from './types';

// Resolves a currency_id of any event to its alphabetic code through the currency stream.
@Injectable()
export class CurrencyResolver {
    constructor(private readonly connection: TransactionalConnection) {}

    // Null when the event names no currency; an id the currency stream has not delivered yet is a retry.
    async codeOf(ctx: RequestContext, source: string, currencyId: unknown): Promise<string | null> {
        if (typeof currencyId !== 'string' || currencyId === '') return null;
        const record = await this.connection
            .getRepository(ctx, CurrencyRecord)
            .findOne({ where: { entityId: currencyId } });
        if (!record) {
            throw new MissingDependencyError(`${source}: currency ${currencyId} not synced yet`);
        }
        return record.code;
    }
}
