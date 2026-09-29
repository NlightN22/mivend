import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { Contract } from './entities/contract.entity';
import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyService } from './counterparty.service';
import { ContractService } from './contract.service';

export type CreditCheckStatus =
    | 'within-limit'
    | 'exceeds-limit'
    | 'not-applicable'
    | 'undetermined';

export interface CreditLimitDecision {
    aggregate: {
        status: 'within-limit' | 'exceeds-limit';
        creditBalance: number;
        creditLimit: number;
    };
    // 'not-applicable': controlledIndividually !== true. 'undetermined': individually controlled
    // but no per-contract balance source exists yet (docs/ai/erp-streams-map.md).
    contract: {
        status: CreditCheckStatus;
        creditLimit: number | null;
    };
    // Overall gate result — false whenever either check is 'exceeds-limit'; 'undetermined' never
    // blocks on its own (there's nothing to enforce until per-contract balance tracking exists).
    withinLimit: boolean;
}

@Injectable()
export class CreditLimitCheckService {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly contractService: ContractService,
    ) {}

    // Pure decision function, kept separate so unit tests exercise it without a DB round trip.
    decide(
        counterparty: Pick<Counterparty, 'creditLimit' | 'creditBalance'>,
        contract: Pick<Contract, 'controlledIndividually' | 'creditLimit'> | null,
    ): CreditLimitDecision {
        const aggregateWithin = counterparty.creditBalance <= counterparty.creditLimit;
        const aggregate = {
            status: (aggregateWithin ? 'within-limit' : 'exceeds-limit') as
                | 'within-limit'
                | 'exceeds-limit',
            creditBalance: counterparty.creditBalance,
            creditLimit: counterparty.creditLimit,
        };

        if (!contract || contract.controlledIndividually !== true) {
            return {
                aggregate,
                contract: {
                    status: 'not-applicable',
                    creditLimit: contract?.creditLimit ? Number(contract.creditLimit) : null,
                },
                withinLimit: aggregateWithin,
            };
        }

        if (contract.creditLimit === null || contract.creditLimit === undefined) {
            return {
                aggregate,
                contract: { status: 'not-applicable', creditLimit: null },
                withinLimit: aggregateWithin,
            };
        }

        // No per-contract current-balance tracking exists yet — cannot be evaluated, must never
        // be silently treated as within-limit.
        return {
            aggregate,
            contract: { status: 'undetermined', creditLimit: Number(contract.creditLimit) },
            withinLimit: aggregateWithin,
        };
    }

    // Loads Counterparty/Contract by id and delegates to decide(). Not wired into checkout
    // (#150) — callers resolve their own ids.
    async check(
        ctx: RequestContext,
        counterpartyErpId: string,
        contractErpId?: string | null,
    ): Promise<CreditLimitDecision | null> {
        const counterparty = await this.counterpartyService.findByErpId(ctx, counterpartyErpId);
        if (!counterparty) return null;
        const contract = contractErpId
            ? await this.contractService.findByErpId(ctx, contractErpId)
            : null;
        return this.decide(counterparty, contract);
    }
}
