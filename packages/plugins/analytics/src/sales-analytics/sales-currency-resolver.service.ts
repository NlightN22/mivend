import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { toAlphaCurrency } from 'shared';
import { In } from 'typeorm';

interface CurrencyRow {
    entityId: string;
    code: string;
    numericCode: string | null;
    isActive: boolean;
}

const MAX_CURRENCIES = 500;
const padNumeric = (value: string): string => value.trim().padStart(3, '0');

// The report keeps what the source sent when the catalog does not know it; nothing is guessed.
@Injectable()
export class SalesCurrencyResolverService {
    constructor(private readonly connection: TransactionalConnection) {}

    async resolver(ctx: RequestContext, values: string[]): Promise<(value: string) => string> {
        const wanted = [...new Set(values.filter(v => v.trim() !== ''))];
        const byId = new Map<string, string>();
        const byNumeric = new Map<string, string>();
        if (wanted.length > 0) {
            const rows = (await this.connection.getRepository(ctx, 'CurrencyRecord').find({
                where: [
                    { entityId: In(wanted) },
                    { numericCode: In(wanted.map(padNumeric)) },
                ] as never,
                take: MAX_CURRENCIES,
            })) as unknown as CurrencyRow[];
            for (const row of rows) {
                byId.set(row.entityId, row.code);
                if (row.numericCode && row.isActive)
                    byNumeric.set(padNumeric(row.numericCode), row.code);
            }
        }
        return value =>
            byId.get(value) ?? byNumeric.get(padNumeric(value)) ?? toAlphaCurrency(value);
    }
}
