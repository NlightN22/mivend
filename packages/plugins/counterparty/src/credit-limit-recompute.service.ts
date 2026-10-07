import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';

import {
    recomputeContractLimitsSql,
    recomputeCounterpartyLimitsSql,
} from './credit-limit-recompute.sql';

export const CREDIT_LIMIT_RECOMPUTE_BATCH_SIZE = 1000;

export interface CreditLimitRecomputeResult {
    contractsUpdated: number;
    counterpartiesUpdated: number;
}

@Injectable()
export class CreditLimitRecomputeService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Contracts first so a counterparty's pool and its contracts' clamped limits come from the same
    // snapshot of inputs. Only rows whose value changed are written, so a second run writes nothing.
    async recomputeAll(
        batchSize = CREDIT_LIMIT_RECOMPUTE_BATCH_SIZE,
    ): Promise<CreditLimitRecomputeResult> {
        return {
            contractsUpdated: await this.drain(recomputeContractLimitsSql, batchSize),
            counterpartiesUpdated: await this.drain(recomputeCounterpartyLimitsSql, batchSize),
        };
    }

    private async drain(sql: string, batchSize: number): Promise<number> {
        let total = 0;
        for (;;) {
            const rows: Array<{ n: number }> = await this.connection.rawConnection.query(sql, [
                batchSize,
            ]);
            const updated = rows[0]?.n ?? 0;
            total += updated;
            if (updated < batchSize) return total;
        }
    }
}
