import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { PackagingPolicyShopResolver } from './packaging-policy.resolver';
import { PackagingPolicyService } from './packaging-policy.service';
import { MultiplicityOrderInterceptor } from './multiplicity-order.interceptor';
import './types';

// Pack-size / MOQ + branch-conditional packaging enforcement — see docs/order-flow.md's
// "Pack-size / MOQ" and mivend#103 sections. Deliberately its own small plugin (AGENTS.md).
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin],
    providers: [PackagingPolicyService],
    shopApiExtensions: {
        schema: gql`
            extend type Query {
                packagesOnlySales: Boolean!
            }
        `,
        resolvers: [PackagingPolicyShopResolver],
    },
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
