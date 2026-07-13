import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import type { CounterpartyRecord } from '../types';

@Injectable()
export class CounterpartyHandler {
    constructor(private readonly counterpartyService: CounterpartyService) {}

    async upsert(ctx: RequestContext, record: CounterpartyRecord): Promise<void> {
        await this.counterpartyService.upsert(ctx, {
            erpId: record.erpId,
            legalName: record.legalName,
            shortName: record.shortName,
            inn: record.inn ?? null,
            creditLimit: record.creditLimit,
            creditBalance: record.creditBalance,
            paymentDelayDays: record.paymentDelayDays,
            priceType: record.priceType,
            isActive: record.isActive,
            departmentId: record.departmentId ?? null,
            branchId: record.branchId ?? null,
        });
    }
}
