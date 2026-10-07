import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS } from './constants';
import { OpenDeferredExposureService } from './open-deferred-exposure.service';
import { DeferredPaymentBootstrapService } from './deferred-payment-bootstrap.service';

// Handler and eligibility checker are plain objects registered in vendure-config's paymentOptions.
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [DeferredPaymentBootstrapService, OpenDeferredExposureService],
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
