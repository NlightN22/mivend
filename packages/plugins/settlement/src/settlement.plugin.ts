import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { SettlementBalance } from './entities/settlement-balance.entity';
import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementDocument } from './entities/settlement-document.entity';
import { SettlementOrderLink } from './entities/settlement-order-link.entity';
import { SettlementBalanceService } from './settlement-balance.service';
import { SettlementCounterpartyListener } from './settlement-counterparty.listener';
import { SettlementDocumentService } from './settlement-document.service';
import { SettlementPendingService } from './settlement-pending.service';
import { SettlementReferenceResolver } from './settlement-reference-resolver';
import { shopApiExtensions } from './api/shop.schema';
import { createSettlementReconcileTask } from './settlement-reconcile.scheduled-task';
import { SettlementReconcileService } from './settlement-reconcile.service';
import { createSettlementRetentionTask } from './settlement-retention.scheduled-task';
import { SettlementRetentionService } from './settlement-retention.service';
import { SettlementShopResolver } from './settlement-shop.resolver';
import { SettlementShopService } from './settlement-shop.service';
import { DEFAULT_RETENTION_MONTHS } from './types';

@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin],
    entities: [SettlementDocument, SettlementDocumentEntry, SettlementOrderLink, SettlementBalance],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [SettlementShopResolver] },
    providers: [
        SettlementReferenceResolver,
        SettlementDocumentService,
        SettlementBalanceService,
        SettlementPendingService,
        SettlementRetentionService,
        SettlementReconcileService,
        SettlementCounterpartyListener,
        SettlementShopService,
    ],
    exports: [SettlementDocumentService, SettlementBalanceService, SettlementPendingService],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.GlobalSettings = [
            ...(config.customFields.GlobalSettings ?? []),
            {
                name: 'settlementCustomerContractKinds',
                type: 'string' as const,
                nullable: true,
                public: false,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Settlement documents: contract kinds shown to customers (comma separated, empty = all)',
                    },
                ],
            },
            {
                name: 'settlementTypeCategories',
                type: 'text' as const,
                nullable: true,
                public: false,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Settlement documents: customer-visible types as documentType=category (sale, payment, return, correction, bonus), comma separated, empty = all types',
                    },
                ],
            },
            {
                name: 'settlementRetentionMonths',
                type: 'int' as const,
                nullable: true,
                public: false,
                defaultValue: DEFAULT_RETENTION_MONTHS,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Settlement documents: keep history before the debt window for (months)',
                    },
                ],
            },
        ];
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createSettlementRetentionTask(),
            createSettlementReconcileTask(),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class SettlementPlugin {}
