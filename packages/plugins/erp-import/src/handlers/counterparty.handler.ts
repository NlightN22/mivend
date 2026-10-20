import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { BranchAssignmentService } from '@mivend/plugin-access-control';
import type { CounterpartyRecord } from '../types';

@Injectable()
export class CounterpartyHandler {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly branchAssignment: BranchAssignmentService,
    ) {}

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
            mainContractId: record.mainContractErpId ?? null,
            departmentId: record.departmentId ?? null,
            erpGroupLabel: record.erpGroupLabel ?? null,
            ...(record.phone !== undefined && { phone: record.phone }),
            ...(record.officialEmail !== undefined && { officialEmail: record.officialEmail }),
        });
        await this.branchAssignment.assignCounterparties(ctx, { erpId: record.erpId });
    }
}
