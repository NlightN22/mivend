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
    // 'not-applicable': contract.controlledIndividually is not true — the earlier, retracted
    // inference-from-creditLimit-presence model must never be reintroduced (see #50 issue
    // history). 'undetermined': controlledIndividually is true and a creditLimit exists, but
    // mivend has no per-contract current-balance data source yet (no ContractCreditBalanceChanged
    // stream — only CounterpartyCreditBalanceChanged does) — never silently treated as within-limit.
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

    // Pure decision function — see the class doc comment for the two-check rule. Kept separate
    // so unit tests exercise the business rule directly, without a RequestContext/DB round trip.
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

        // controlledIndividually is true and a creditLimit is declared, but there is no
        // per-contract current-balance tracking mechanism implemented yet (see this file's own
        // top-level doc comment) — this check cannot be evaluated, and must never be silently
        // treated as within-limit.
        return {
            aggregate,
            contract: { status: 'undetermined', creditLimit: Number(contract.creditLimit) },
            withinLimit: aggregateWithin,
        };
    }

    // Thin service wrapper — loads the Counterparty and (optionally) a specific Contract by their
    // already-existing fields and delegates to decide(). Not wired into checkout (#50's decision
    // on where to hook this in is deliberately deferred) — callers resolve their own
    // counterparty/contract ids.
    async check(
        ctx: RequestContext,
        counterpartyId: string,
        contractErpId?: string | null,
    ): Promise<CreditLimitDecision | null> {
        const counterparty = await this.counterpartyService.findByErpId(ctx, counterpartyId);
        if (!counterparty) return null;
        const contract = contractErpId
            ? await this.contractService.findByErpId(ctx, contractErpId)
            : null;
        return this.decide(counterparty, contract);
    }
}
