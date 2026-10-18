import gql from 'graphql-tag';

import { tradingPointFields } from './trading-point.schema';

// Exported so tests can assert on the real SDL against fields written to the entity/DB.
export const adminApiSchema = gql`
    ${tradingPointFields}

    # implements Node/PaginatedList: the Dashboard list hook cannot bind items/totalItems without them (#133).
    type Counterparty implements Node {
        id: ID!
        erpId: String!
        legalName: String!
        shortName: String!
        inn: String
        "Null for a caller without ReadCounterpartyCredit — see CounterpartyCreditResolver"
        creditLimit: Int
        "Null for a caller without ReadCounterpartyCredit — see CounterpartyCreditResolver"
        creditBalance: Int
        paymentDelayDays: Int!
        "Null when the viewer may not see this price type — see CounterpartyPriceTypeResolver"
        priceType: String
        isActive: Boolean!
        assignedManagerId: String
        "Raw ERP manager id (the ERP) — fallback display when assignedManagerId hasn't resolved yet, see issue #133."
        managerErpId: String
        "The linked Customer's id, if any (read-only; the write path is issue #120's activation mutation)."
        linkedCustomerId: ID
        departmentId: String
        branchId: String
        creditTermOverrideExtraDays: Int
        "Free-text group/segment label from the ERP — display and filtering only."
        erpGroupLabel: String
        "Юридический адрес контрагента (the ERP) — display/completeness only, see issue #120 Decision 1."
        legalAddress: String
        "Фактический адрес контрагента (the ERP) — display/completeness only, see issue #120 Decision 1."
        factualAddress: String
        "Телефон контрагента (the ERP) — required with officialEmail before #120's portal-access activation."
        phone: String
        "Служебный адрес электронной почты контрагента (the ERP) — the real login-eligible email, see issue #120."
        officialEmail: String
        tradingPoints: [TradingPoint!]!
        "Additional managers beyond the Owner (assignedManagerId) — see CounterpartyTeamMember."
        teamMembers: [CounterpartyTeamMember!]!
        "Customers linked to this Counterparty via customFields.counterpartyId, active or deactivated — issue #120."
        portalUsers: [Customer!]!
    }

    "activate | deactivate — one entry in a bulk portal-access batch (issue #120)."
    input CounterpartyPortalAccessChangeInput {
        counterpartyId: ID!
        action: String!
    }

    type CounterpartyPortalAccessChangeResult {
        counterpartyId: ID!
        success: Boolean!
        error: String
        customerId: ID
    }

    "backup | observer | accounting-contact — a small fixed technical RBAC role set, not ERP-sourced business data"
    type CounterpartyTeamMember {
        id: ID!
        counterpartyId: String!
        administratorId: String!
        role: String!
        phone: String
        createdAt: DateTime!
    }

    extend type Customer {
        counterparty: Counterparty
        preferredTradingPoint: TradingPoint
    }

    type CounterpartyList implements PaginatedList {
        items: [Counterparty!]!
        totalItems: Int!
    }

    input CounterpartyListOptions {
        take: Int
        skip: Int
        search: String
        "active | inactive"
        status: String
        managerId: ID
        "Substring match (case-insensitive) against Counterparty.managerErpId OR the ERP-reported administrator name (access-control's erp_user.fullName) — the raw ERP-side manager assignment, independent of whether it has resolved to an Administrator yet"
        managerErpId: String
        branchId: String
        "Exact match against Counterparty.erpGroupLabel"
        groupLabel: String
        "When true, overrides managerId and filters to counterparties with no assigned manager"
        unassignedOnly: Boolean
        sort: CounterpartySortParameter
    }

    "Narrowing half of CounterpartyListOptions, for mutations that act on every row a list filter matches (issue #136)"
    input CounterpartyListFilter {
        search: String
        status: String
        managerId: ID
        managerErpId: String
        branchId: String
        groupLabel: String
        unassignedOnly: Boolean
    }

    "Only real Counterparty columns a human would actually want to order by — never a UUID/id-shaped one (branchId), and never a derived/joined display value (the Manager column shows an ERP-resolved name, not managerErpId itself) — see manager-table-standard skill's sorting follow-up, issue #138."
    input CounterpartySortParameter {
        shortName: SortOrder
        inn: SortOrder
        managerErpId: SortOrder
        phone: SortOrder
        officialEmail: SortOrder
    }

    type CounterpartySummary {
        totalCount: Int!
        activeCount: Int!
        "Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary"
        totalCreditBalance: Int
        "Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary"
        highUsageCount: Int
    }

    extend type Query {
        counterparties(options: CounterpartyListOptions): CounterpartyList!
        counterparty(id: ID!): Counterparty
        counterpartySummary: CounterpartySummary!
        unassignedCounterpartyCount: Int!
        highUsageCounterparties(limit: Int!): [Counterparty!]!
        tradingPoint(id: ID!): TradingPoint
    }

    extend type Mutation {
        upsertCounterparty(
            erpId: String!
            legalName: String!
            shortName: String!
            inn: String
            creditLimit: Int!
            creditBalance: Int!
            paymentDelayDays: Int!
            priceType: String!
            isActive: Boolean!
            departmentId: String
            branchId: String
            erpGroupLabel: String
        ): Counterparty!

        assignCustomerToCounterparty(customerId: ID!, erpId: String!, role: String!): Boolean!

        # Department-head only within their own department, portal-admin unrestricted — see
        # CustomPermission.ReassignCounterpartyManager.
        reassignCounterpartyManager(counterpartyId: ID!, administratorId: ID!): Counterparty!
        # Issue #136: same permission/scope rules, applied to every visible row matching filter.
        # Fails if the match count differs from expectedCount. Returns the number of rows changed.
        reassignCounterpartyManagerByFilter(
            filter: CounterpartyListFilter!
            administratorId: ID!
            expectedCount: Int!
        ): Int!

        # Add/remove additional team members beyond the Owner — see CustomPermission.ManageCounterpartyTeam.
        addCounterpartyTeamMember(
            counterpartyId: ID!
            administratorId: ID!
            role: String!
            phone: String
        ): CounterpartyTeamMember!
        removeCounterpartyTeamMember(counterpartyId: ID!, administratorId: ID!): Boolean!

        # Issue #120 Decision 7: creates a Customer without a password (AccountRegistrationEvent
        # fires instead), linked via customFields.counterpartyId. Requires Counterparty.phone AND
        # .officialEmail to already be set (ERP-sourced, see #131) and isActive=true.
        activateCounterpartyPortalAccess(counterpartyId: ID!): Customer!
        # Native Customer soft-delete — same primitive as issue #119's Administrator deactivation.
        deactivateCounterpartyPortalAccess(customerId: ID!): Customer!
        # Bulk-activation table's single batch mutation (issue #120) — one item per row, reported
        # independently so one bad row never blocks the rest of the batch.
        applyCounterpartyPortalAccessChanges(
            changes: [CounterpartyPortalAccessChangeInput!]!
        ): [CounterpartyPortalAccessChangeResult!]!

        upsertTradingPoint(
            erpId: String!
            counterpartyErpId: String!
            name: String!
            address: String!
            latitude: Float
            longitude: Float
            workingHours: String
            isActive: Boolean!
        ): TradingPoint!

        updateTradingPointComment(tradingPointId: ID!, comment: String): TradingPoint!
        setPreferredTradingPoint(tradingPointId: ID!): Boolean!

        # Staff patch mutations — gated on "can see this counterparty" rather than
        # Permission.UpdateCustomer; see TradingPointAdminResolver.
        updateTradingPointDetails(id: ID!, input: TradingPointDetailsInput!): TradingPoint!
        setTradingPointActive(id: ID!, isActive: Boolean!): TradingPoint!

        requestCreditTermExtension(input: CreditTermRequestInput!): ApprovalRequest!
        decideCreditTermRequest(
            requestId: ID!
            decision: String!
            comment: String
        ): ApprovalRequest!
    }

    input CreditTermRequestInput {
        counterpartyErpId: String!
        requestedExtraDays: Int!
        requestedAmount: Int
        justification: String!
    }

    input ContactPersonInput {
        name: String!
        phone: String
        email: String
        isPrimary: Boolean
    }

    input TradingPointDetailsInput {
        name: String
        address: String
        workingHours: String
        deliveryComment: String
        servicingBranchId: String
        contacts: [ContactPersonInput!]
    }
`;
