import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import {
    recomputeContractLimitsSql,
    recomputeCounterpartyLimitsSql,
    recomputePaymentDelayDaysSql,
} from './credit-limit-recompute.sql';
import { ctxQuery } from 'shared';

export const CREDIT_LIMIT_RECOMPUTE_BATCH_SIZE = 1000;

export interface CreditLimitRecomputeResult {
    contractsUpdated: number;
    counterpartiesUpdated: number;
    paymentDelaysUpdated: number;
}

@Injectable()
export class CreditLimitRecomputeService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Contracts first so a counterparty's pool and its contracts' clamped limits come from the same
    // snapshot of inputs. Only rows whose value changed are written, so a second run writes nothing.
    async recomputeAll(
        ctx: RequestContext,
        batchSize = CREDIT_LIMIT_RECOMPUTE_BATCH_SIZE,
    ): Promise<CreditLimitRecomputeResult> {
        return {
            contractsUpdated: await this.drain(ctx, recomputeContractLimitsSql, batchSize),
            counterpartiesUpdated: await this.drain(ctx, recomputeCounterpartyLimitsSql, batchSize),
            paymentDelaysUpdated: await this.drain(ctx, recomputePaymentDelayDaysSql, batchSize),
        };
    }

    private async drain(ctx: RequestContext, sql: string, batchSize: number): Promise<number> {
        let total = 0;
        for (;;) {
            const rows: Array<{ n: number }> = await ctxQuery<Array<{ n: number }>>(
                this.connection,
                ctx,
                sql,
                [batchSize],
            );
            const updated = rows[0]?.n ?? 0;
            total += updated;
            if (updated < batchSize) return total;
        }
    }
}
