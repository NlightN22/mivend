import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS } from './constants';
import { OpenDeferredExposureService } from './open-deferred-exposure.service';
import { DeferredCreditAssessmentService } from './deferred-credit-assessment.service';
import { DeferredCreditShopResolver } from './api/shop.resolver';
import { CreditFlagService } from './credit-flag.service';
import { CreditFlagAdminResolver, OrderCreditFlagResolver } from './api/admin.resolver';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';
import { DeferredPaymentBootstrapService } from './deferred-payment-bootstrap.service';

// Handler and eligibility checker are plain objects registered in vendure-config's paymentOptions.
@VendurePlugin({
    imports: [PluginCommonModule, CounterpartyPlugin, ErpOrderPlugin],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [DeferredCreditShopResolver] },
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [OrderCreditFlagResolver, CreditFlagAdminResolver],
    },
    providers: [
        CreditFlagService,
        DeferredPaymentBootstrapService,
        OpenDeferredExposureService,
        DeferredCreditAssessmentService,
    ],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.GlobalSettings = [
            ...(config.customFields.GlobalSettings ?? []),
            {
                name: 'deferredOrderMaxAgeDays',
                type: 'int' as const,
                nullable: true,
                public: false,
                defaultValue: DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Deferred orders: stop counting against the credit limit after (days)',
                    },
                ],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class DeferredPaymentPlugin {}
