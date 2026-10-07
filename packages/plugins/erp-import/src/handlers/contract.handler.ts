import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';
import type { ContractRecord } from '../types';

@Injectable()
export class ContractHandler {
    constructor(
        private readonly contractService: ContractService,
        private readonly counterpartyService: CounterpartyService,
    ) {}

    async upsert(ctx: RequestContext, record: ContractRecord): Promise<void> {
        const counterparty = await this.counterpartyService.findByErpId(
            ctx,
            record.counterpartyErpId,
        );
        if (!counterparty) {
            throw new Error(
                `contract ${record.erpId}: counterparty erpId=${record.counterpartyErpId} not imported yet`,
            );
        }
        await this.contractService.upsertActiveState(ctx, record.erpId, {
            name: record.name ?? record.erpId,
            counterpartyId: String(counterparty.id),
            organizationId: record.organizationId ?? '',
            priceTypeId: record.priceTypeId,
            isActive: record.isActive,
            contractKind: '',
            contractType: '',
            creditLimit: record.creditLimit ?? null,
            controlledIndividually: record.controlledIndividually ?? false,
            debtDaysLimit: record.debtDaysLimit ?? null,
            paymentDelayDays: null,
        });
    }
}
