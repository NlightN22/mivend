import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { DiscountRule } from './discount-rule.entity';
import { DiscountGrant } from './discount-grant.entity';
import { DiscountRegistryEntry } from './discount-registry-entry.entity';
import {
    DiscountRuleAdminResolver,
    OrderLineDiscountResolver,
    PriceEntryAdminResolver,
    ProductVariantPriceResolver,
} from './price-entry.resolver';
import { PriceAdjustmentResolver } from './price-adjustment.resolver';
import { DiscountGrantResolver } from './discount-grant.resolver';
import { DiscountRegistryResolver } from './discount-registry.resolver';
import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService } from './discount-rule.service';
import { PriceResolutionService } from './price-resolution.service';
import { TierRebalanceService } from './tier-rebalance.service';
import { PriceAdjustmentGateService } from './price-adjustment-gate.service';
import { PriceAdjustmentService } from './price-adjustment.service';
import { DiscountGrantService } from './discount-grant.service';
import { DiscountRegistryService } from './discount-registry.service';

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

    type VariantPriceEntry {
        variantId: ID!
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

    input DiscountGrantInput {
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
        justification: String!
        # Links a renewal to the DiscountRule it extends — see docs/ai/manager-portal-concept.md
        # §4.1.1. This is the DiscountRule.erpId of the rule being renewed, e.g. a prior
        # "portal-<requestId>" value.
        supersedesDiscountRuleId: String
        # Omitted/empty = company-wide grant. Provided = the grant applies only to these
        # counterparties (DiscountGrant.scopeType = 'customer').
        counterpartyIds: [ID!]
    }

    type DiscountGrantCounterparty {
        id: ID!
        legalName: String!
    }

    type DiscountGrant {
        id: ID!
        discountRuleId: ID!
        scopeType: String!
        validTo: DateTime!
        counterparties: [DiscountGrantCounterparty!]!
    }

    type DiscountGrantForCustomer {
        id: ID!
        facetValueCode: String
        percent: Int!
        validTo: DateTime!
        scopeType: String!
    }

    # Read-model/projection row for the /discounts registry — see DiscountRegistryEntry /
    # DiscountRegistryService. One row per discount-grant attempt through its whole lifecycle
    # (pending -> materialized or rejected), never joined at query time from DiscountRule +
    # ApprovalRequest.
    type DiscountRegistryEntry {
        id: ID!
        approvalRequestId: ID
        discountRuleId: ID
        status: String!
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        justification: String
        counterpartyIds: [String!]
    }

    type DiscountRegistryEntryList {
        items: [DiscountRegistryEntry!]!
        totalItems: Int!
    }

    input DiscountRegistryListOptions {
        take: Int
        skip: Int
        search: String
        priceTypeCode: String
        # active | expiring-soon | expired | pending | rejected
        status: String
    }

    extend type Query {
        # Restricted to ReadFloorPrice — see PriceAdjustmentResolver.
        floorPrice(variantId: ID!): Int
        discountRules(priceTypeCode: String): [DiscountRule!]!
        expiringDiscountGrants(withinDays: Int!): [DiscountGrant!]!
        # Only grants that actually apply to this counterparty (company-wide or scoped to it) —
        # see DiscountGrantService.findForCounterparty.
        discountGrantsForCounterparty(counterpartyId: ID!): [DiscountGrantForCustomer!]!
        priceTypeCodes: [String!]!
        # Batch lookup for the catalog list/detail pages. Gated on ReadCatalog UNLESS
        # priceTypeCode is the floor price type, which requires ReadFloorPrice instead —
        # see PriceEntryAdminResolver.priceEntriesForVariants.
        priceEntriesForVariants(variantIds: [ID!]!, priceTypeCode: String!): [VariantPriceEntry!]!
        # Real server-side pagination + filtering for the /discounts registry (issue #39) — the
        # single unified list, replacing the earlier two-table split (discountRulesPage +
        # approvalRequestsByType) that didn't match the design concept.
        discountRegistryPage(options: DiscountRegistryListOptions): DiscountRegistryEntryList!
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
        # Standing policy discount — always requires approval, no direct-apply tier (see
        # DiscountGrantService).
        requestDiscountGrant(input: DiscountGrantInput!): ApprovalRequest!
        decideDiscountGrantRequest(
            requestId: ID!
            decision: String!
            comment: String
        ): ApprovalRequest!
        # One-off, idempotent backfill for DiscountRule/ApprovalRequest rows that existed before
        # DiscountRegistryEntry did — see DiscountRegistryService.backfill. Not part of any
        # regular seed/dev flow; run manually once per environment that already had discount
        # grant data before this migration.
        backfillDiscountRegistry: Int!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, ApprovalWorkflowPlugin, CounterpartyPlugin],
    entities: [ProductVariantPriceEntry, DiscountRule, DiscountGrant, DiscountRegistryEntry],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [ProductVariantPriceResolver, OrderLineDiscountResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [
            PriceEntryAdminResolver,
            DiscountRuleAdminResolver,
            PriceAdjustmentResolver,
            DiscountGrantResolver,
            DiscountRegistryResolver,
        ],
    },
    providers: [
        PriceEntryService,
        DiscountRuleService,
        PriceResolutionService,
        TierRebalanceService,
        PriceAdjustmentGateService,
        PriceAdjustmentService,
        DiscountGrantService,
        DiscountRegistryService,
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
