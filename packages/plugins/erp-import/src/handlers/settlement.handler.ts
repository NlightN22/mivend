import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import {
    SettlementBalanceService,
    SettlementDocumentService,
    SettlementDocumentTypeService,
} from '@mivend/plugin-settlement';
import type {
    SettlementBalanceRecord,
    SettlementDocumentRecord,
    SettlementDocumentTypeRecord,
} from '../settlement-types';

const toDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`invalid date "${value}"`);
    return date;
};

// Same settlement services the Kafka stream handlers apply; a stale version is a no-op there too.
@Injectable()
export class SettlementHandler {
    constructor(
        private readonly documentService: SettlementDocumentService,
        private readonly balanceService: SettlementBalanceService,
        private readonly documentTypeService: SettlementDocumentTypeService,
    ) {}

    async upsertDocument(ctx: RequestContext, record: SettlementDocumentRecord): Promise<void> {
        const isDeleted = record.isDeleted === true;
        const date = toDate(record.date);
        if (!isDeleted && !date) throw new Error(`settlementDocument ${record.erpId}: no date`);
        await this.documentService.apply(ctx, {
            erpId: record.erpId,
            version: record.version,
            isDeleted,
            documentType: record.documentType,
            documentTypeLabel: record.documentTypeLabel,
            number: record.number,
            date,
            entries: isDeleted
                ? []
                : record.entries.map(entry => ({
                      organizationErpId: entry.organizationErpId,
                      counterpartyErpId: entry.counterpartyErpId,
                      contractErpId: entry.contractErpId,
                      currency: entry.currency,
                      amount: entry.amount,
                      dueDate: toDate(entry.dueDate),
                      orderLinks: [],
                  })),
        });
    }

    async upsertBalance(ctx: RequestContext, record: SettlementBalanceRecord): Promise<void> {
        await this.balanceService.apply(ctx, {
            key: record.key,
            version: record.version,
            isDeleted: record.isDeleted === true,
            organizationErpId: record.organizationErpId,
            counterpartyErpId: record.counterpartyErpId,
            contractErpId: record.contractErpId,
            currency: record.currency,
            openingDate: toDate(record.openingDate),
            openingBalance: record.openingBalance,
            closingBalance: record.closingBalance,
        });
    }

    async upsertDocumentType(
        ctx: RequestContext,
        record: SettlementDocumentTypeRecord,
    ): Promise<void> {
        await this.documentTypeService.apply(ctx, {
            documentType: record.documentType,
            version: record.version,
            isDeleted: record.isDeleted === true,
            label: record.label,
            category: record.category,
            customerVisible: record.customerVisible,
            sortOrder: record.sortOrder ?? null,
        });
    }
}
