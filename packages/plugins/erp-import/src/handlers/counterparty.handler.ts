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
            // branchId is deliberately never set here — no automatic ERP-driven or
            // rule-based branch assignment for counterparties exists yet (tracked in issue #65,
            // "Counterparty→Branch auto-assignment worker"). Leaving it unset (rather than
            // passing through record.branchId raw) avoids exactly the bug docs/access-control.md
            // now calls out: a raw ERP-sourced id here is not the same value space as the mivend
            // Branch.id every real branchId consumer (AccessScopeService, BranchSettingsService,
            // Warehouse.branchId) expects. #65's worker is the intended, single place that will
            // ever set this field, once it exists.
            erpGroupLabel: record.erpGroupLabel ?? null,
        });
    }
}
