import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS } from './constants';
import { OpenDeferredExposureService } from './open-deferred-exposure.service';
import { DeferredCreditAssessmentService } from './deferred-credit-assessment.service';
import { DeferredCreditShopResolver } from './api/shop.resolver';
import { CreditFlagService } from './credit-flag.service';
import { CreditLimitCheckRegistrar } from './credit-limit-check.registrar';
import { CreditFlagAdminResolver, OrderCreditFlagResolver } from './api/admin.resolver';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';
import { CreditPlacementService } from './credit-placement.service';

// Credit control is a policy applied by every payment-form handler via CreditPlacementService.
@VendurePlugin({
    imports: [
        PluginCommonModule,
        AccessControlPlugin,
        ChecksPlugin,
        CounterpartyPlugin,
        ErpOrderPlugin,
    ],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [DeferredCreditShopResolver] },
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [OrderCreditFlagResolver, CreditFlagAdminResolver],
    },
    providers: [
        CreditFlagService,
        CreditPlacementService,
        OpenDeferredExposureService,
        DeferredCreditAssessmentService,
        CreditLimitCheckRegistrar,
    ],
    exports: [CreditPlacementService],
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
