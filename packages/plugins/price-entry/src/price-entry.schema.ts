import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const shopApiSchema: DocumentNode = gql`
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
        tierProgress: TierProgress
    }

    extend type OrderLine {
        compareAtPrice: Int
        tierProgress: TierProgress
    }
`;

export const adminApiSchema: DocumentNode = gql`
    type PriceEntry {
        id: ID!
        variantId: ID!
        priceTypeCode: String!
        price: Int!
    }

    type FloorPriceEntry {
        variantId: ID!
        price: Float!
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
        "Null for a promo rule (issue #107) — those apply regardless of price type."
        priceTypeCode: String
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
        "Promo-rule fields (issue #107) — null for a facet/priceType-threshold rule."
        triggerProductErpId: String
        triggerQuantity: Float
        giftProductErpId: String
        giftQuantity: Float
        operationKind: String
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
        "Human-facing business number — see DiscountGrant.number's own doc comment (discount-grant.entity.ts)."
        number: String!
        createdAt: DateTime!
        facetValueCode: String
        percent: Int!
        validTo: DateTime!
        scopeType: String!
        "active | expiring-soon | expired — computed server-side, see DiscountGrantService.computeGrantStatus."
        status: String!
    }

    type DiscountGrantForCustomerList {
        items: [DiscountGrantForCustomer!]!
        totalItems: Int!
    }

    input DiscountGrantForCustomerListOptions {
        take: Int
        skip: Int
        "Substring match against the grant's own number (DiscountGrant.number)."
        search: String
        "active | expiring-soon | expired"
        status: String
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
        # Restricted to ReadConfidentialPriceTypes — see PriceAdjustmentResolver.
        floorPrice(variantId: ID!): Float
        floorPricesForVariants(variantIds: [ID!]!): [FloorPriceEntry!]!
        discountRules(priceTypeCode: String): [DiscountRule!]!
        expiringDiscountGrants(withinDays: Int!): [DiscountGrant!]!
        # Only grants that actually apply to this counterparty (company-wide or scoped to it) —
        # see DiscountGrantService.findForCounterparty. Real server-side pagination — this list
        # accumulates over the customer's lifetime (nothing removes an expired grant), it is not
        # a genuinely bounded set.
        discountGrantsForCounterparty(
            counterpartyId: ID!
            options: DiscountGrantForCustomerListOptions
        ): DiscountGrantForCustomerList!
        priceTypeCodes: [String!]!
        # Batch lookup for the catalog list/detail pages; see PriceEntryAdminResolver.priceEntriesForVariants.
        priceEntriesForVariants(variantIds: [ID!]!, priceTypeCode: String!): [VariantPriceEntry!]!
        # Real server-side pagination + filtering for the /discounts registry (issue #39) — the
        # single unified list, replacing the earlier two-table split (discountRulesPage +
        # approvalRequestsByType) that didn't match the design concept.
        discountRegistryPage(options: DiscountRegistryListOptions): DiscountRegistryEntryList!
    }

    extend type Mutation {
        """
        Prices the variant's whole product: the entry is keyed by the product ERP id, so every variant of that product gets the price.
        """
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
