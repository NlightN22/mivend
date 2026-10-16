import { Injectable, OnModuleInit } from '@nestjs/common';
import { Order, OrderLine, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import {
    CONTRACT_UNRESOLVED,
    LINE_WITHOUT_ORGANIZATION,
    evaluateContractUnresolved,
    evaluateLinesWithoutOrganization,
} from './order-data-checks';
import { findLinesWithoutOrganization } from './order-data-checks.query';
import { resolveOrderContractFor } from './order-contract-resolution';

interface OrderSubject {
    orderId: string;
    customerId: string | null;
    buyerCounterpartyId: string | null;
}

const STAGES = ['checkout', 'pre-reserve', 'on-edit'];
// The customer is never stopped at checkout; the manager stage holds the automatic reserve.
const STAGE_DEFAULTS = { checkout: 'warn', 'pre-reserve': 'hold', 'on-edit': 'warn' } as const;

@Injectable()
export class OrderDataChecksRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private counterparties: CounterpartyService,
        private contracts: ContractService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<OrderSubject>({
            code: LINE_WITHOUT_ORGANIZATION,
            subjectType: 'order',
            stages: STAGES,
            description: 'Every order line needs a seller organization (its variant has none).',
            stageDefaults: STAGE_DEFAULTS,
            evaluate: async (subject, { ctx }) => {
                const repo = this.connection.getRepository(ctx, OrderLine);
                const rows = await findLinesWithoutOrganization(
                    (sql, params) => repo.query(sql, params),
                    subject.orderId,
                );
                return evaluateLinesWithoutOrganization(rows);
            },
        });
        this.registry.registerCheck<OrderSubject>({
            code: CONTRACT_UNRESOLVED,
            subjectType: 'order',
            stages: STAGES,
            description: 'The buyer needs a usable contract to register the order in the ERP.',
            stageDefaults: STAGE_DEFAULTS,
            evaluate: async (subject, { ctx }) => {
                if (!subject.buyerCounterpartyId || !subject.customerId) return [];
                const rows: { selected: string | null }[] = await this.connection
                    .getRepository(ctx, Order)
                    .query(
                        `SELECT "customFieldsSelectedcontractid" AS selected FROM "order" WHERE id = $1`,
                        [subject.orderId],
                    );
                const contract = await resolveOrderContractFor(
                    { counterparties: this.counterparties, contracts: this.contracts },
                    ctx,
                    { customerId: subject.customerId, selectedContractId: rows[0]?.selected },
                );
                return evaluateContractUnresolved({
                    buyerCounterpartyId: subject.buyerCounterpartyId,
                    contractResolved: contract !== null,
                });
            },
        });
    }
}
