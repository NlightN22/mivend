import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { MultiplicityOrderInterceptor } from './multiplicity-order.interceptor';
import './types';

// Pack-size / MOQ enforcement — see docs/order-flow.md "Pack-size / MOQ". Deliberately its own
// small plugin (modularity first, AGENTS.md) rather than folded into catalog/erp-import — the
// only responsibility here is the multiplicity custom field and its OrderInterceptor.
@VendurePlugin({
    imports: [PluginCommonModule],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.ProductVariant = [
            ...(config.customFields.ProductVariant ?? []),
            {
                name: 'multiplicity',
                type: 'int' as const,
                nullable: true,
                min: 0,
                label: [{ languageCode: LanguageCode.en, value: 'Multiplicity (pack size)' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Order quantity must be a multiple of this. Unset/0/negative = no constraint (data error, not enforced); 1 = no constraint; >1 = required step.',
                    },
                ],
            },
        ];
        config.orderOptions.orderInterceptors = [
            ...(config.orderOptions.orderInterceptors ?? []),
            new MultiplicityOrderInterceptor(),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class MoqPlugin {}
