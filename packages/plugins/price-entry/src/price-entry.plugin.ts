import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { DiscountRule } from './discount-rule.entity';
import {
    DiscountRuleAdminResolver,
    OrderLineDiscountResolver,
    PriceEntryAdminResolver,
    ProductVariantPriceResolver,
} from './price-entry.resolver';
import { PriceAdjustmentResolver } from './price-adjustment.resolver';
import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService } from './discount-rule.service';
import { PriceResolutionService } from './price-resolution.service';
import { TierRebalanceService } from './tier-rebalance.service';
import { PriceAdjustmentGateService } from './price-adjustment-gate.service';
import { PriceAdjustmentService } from './price-adjustment.service';

const shopApiSchema = gql`
    type DiscountTier {
        percent: Int!
        minWeightKg: Float
        minAmount: Int
    }

    enum TierMetric {
        WEIGHT
        AMOUNT
    }

    type TierProgress {
        facetName: String!
        metric: TierMetric!
        current: Float!
        currentPercent: Int
        nextThreshold: Float
        nextPercent: Int
    }

    extend type ProductVariant {
        customerPrice: Int
        compareAtPrice: Int
        discountTiers: [DiscountTier!]!
    }

    extend type OrderLine {
        compareAtPrice: Int
        tierProgress: TierProgress
    }
`;

const adminApiSchema = gql`
    type PriceEntry {
        id: ID!
        variantId: ID!
        priceTypeCode: String!
        price: Int!
    }

    input PriceEntryInput {
        variantId: ID!
        priceTypeCode: String!
        price: Int!
    }

    type DiscountRule {
        id: ID!
        erpId: String!
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
    }

    input DiscountRuleInput {
        erpId: String!
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
    }

    type PriceAdjustmentResult {
        decision: String!
        approvalRequestId: ID
    }

    extend type Query {
        # Restricted to ReadFloorPrice — see PriceAdjustmentResolver.
        floorPrice(variantId: ID!): Int
    }

    extend type Mutation {
        upsertPriceEntry(variantId: ID!, priceTypeCode: String!, price: Int!): PriceEntry!
        bulkUpsertPriceEntries(entries: [PriceEntryInput!]!): Int!
        upsertDiscountRule(input: DiscountRuleInput!): DiscountRule!
        bulkUpsertDiscountRules(entries: [DiscountRuleInput!]!): Int!
        requestPriceAdjustment(
            orderId: ID!
            orderLineId: ID!
            requestedPrice: Int!
            justification: String
        ): PriceAdjustmentResult!
        decidePriceAdjustmentRequest(
            requestId: ID!
            decision: String!
            comment: String
        ): ApprovalRequest!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, ApprovalWorkflowPlugin],
    entities: [ProductVariantPriceEntry, DiscountRule],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [ProductVariantPriceResolver, OrderLineDiscountResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [PriceEntryAdminResolver, DiscountRuleAdminResolver, PriceAdjustmentResolver],
    },
    providers: [
        PriceEntryService,
        DiscountRuleService,
        PriceResolutionService,
        TierRebalanceService,
        PriceAdjustmentGateService,
        PriceAdjustmentService,
    ],
    exports: [DiscountRuleService, PriceResolutionService],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.OrderLine = [
            ...(config.customFields.OrderLine ?? []),
            {
                name: 'manualUnitPrice',
                type: 'int' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manual unit price override' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Set by PriceAdjustmentService when a manager-adjusted price is applied — see CustomerPriceCalculationStrategy.',
                    },
                ],
            },
            {
                name: 'manualPriceReason',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manual price override reason' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class PriceEntryPlugin {}
