import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import type { RetroBonusSetupRecord } from '../types';

@Injectable()
export class RetroBonusSetupHandler {
    constructor(private readonly rules: RetroBonusRuleService) {}

    async upsert(ctx: RequestContext, record: RetroBonusSetupRecord): Promise<void> {
        const allProducts = record.allProducts ?? false;
        await this.rules.apply(ctx, {
            rule: {
                erpId: record.erpId,
                documentNumber: record.documentNumber ?? '',
                isInstant: false,
                accrualPeriod: null,
                accrualDayNumber: 0,
                accrualKind: '',
                percent: record.percent,
                conditionAmount: null,
                conditionQuantity: null,
                priceTypeErpId: null,
                organizationErpId: null,
                recipientCounterpartyErpId: record.counterpartyErpId,
                recipientContractErpId: null,
                validFrom: record.validFrom ? new Date(record.validFrom) : new Date(),
                validTo: record.validTo ? new Date(record.validTo) : null,
                allCounterparties: false,
                allProducts,
                counterpartyMode: 'list',
                productMode: 'list',
                counterpartyFilter: null,
                productFilter: null,
                sourceVersion: record.version,
            },
            counterpartyErpIds: [record.counterpartyErpId],
            productErpIds: allProducts ? [] : (record.productErpIds ?? []),
        });
    }
}
