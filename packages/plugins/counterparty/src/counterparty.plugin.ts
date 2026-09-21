import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { VersioningPlugin } from '@mivend/plugin-versioning';

import { CounterpartyConsumer } from './consumers/counterparty.consumer';
import { TradingPointConsumer } from './consumers/trading-point.consumer';
import { Counterparty } from './entities/counterparty.entity';
import { ContactPerson } from './entities/contact-person.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { CounterpartyTeamMember } from './entities/counterparty-team-member.entity';
import {
    CustomerCounterpartyResolver,
    CounterpartyResolver,
    CounterpartyCreditResolver,
    CounterpartyCustomerLinkResolver,
} from './counterparty.resolver';
import {
    CounterpartyTeamFieldResolver,
    CounterpartyTeamMutationResolver,
} from './counterparty-team.resolver';
import { CounterpartyTeamService } from './counterparty-team.service';
import {
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    TradingPointAdminResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
} from './trading-point.resolver';
import { CreditTermResolver } from './credit-term.resolver';
import { CounterpartyService } from './counterparty.service';
import { TradingPointService } from './trading-point.service';
import { CreditTermGateService } from './credit-term-gate.service';
import { CreditTermService } from './credit-term.service';
import { AdministratorLinkedListener } from './administrator-linked.listener';

const tradingPointFields = gql`
    type ContactPerson {
        id: ID!
        name: String!
        phone: String
        email: String
        isPrimary: Boolean!
    }

    type TradingPoint {
        id: ID!
        erpId: String!
        name: String!
        address: String!
        latitude: Float
        longitude: Float
        workingHours: String
        deliveryComment: String
        isActive: Boolean!
        customerStatus: String!
        customerOwned: Boolean!
        servicingBranchId: String
        contacts: [ContactPerson!]!
    }
`;

const shopApiSchema = gql`
    ${tradingPointFields}

    type Counterparty {
        id: ID!
        erpId: String!
        legalName: String!
        shortName: String!
        inn: String
        creditLimit: Int!
        creditBalance: Int!
        paymentDelayDays: Int!
        priceType: String!
        isActive: Boolean!
        tradingPoints: [TradingPoint!]!
    }

    extend type Customer {
        counterparty: Counterparty
        preferredTradingPoint: TradingPoint
    }

    extend type Query {
        tradingPoint(id: ID!): TradingPoint
        myTradingPoints: [TradingPoint!]!
        myHiddenTradingPoints: [TradingPoint!]!
    }

    extend type Mutation {
        setPreferredTradingPoint(tradingPointId: ID!): Boolean!
        updateTradingPointComment(tradingPointId: ID!, comment: String): TradingPoint!
        customerAddTradingPoint(
            name: String!
            address: String!
            workingHours: String
            deliveryComment: String
            contactName: String
            contactPhone: String
        ): TradingPoint
        customerEditTradingPoint(
            id: ID!
            name: String!
            address: String!
            workingHours: String
            deliveryComment: String
            contactName: String
            contactPhone: String
        ): TradingPoint
        customerDeleteTradingPoint(id: ID!): Boolean!
        customerRestoreTradingPoint(id: ID!): TradingPoint
    }
`;

// Exported so counterparty-admin-schema.test.ts can assert on the real SDL directly — the
// mivend.audit.common finding on issue #131 was exactly a field written to the entity/DB with
// no corresponding SDL field, undetected until a human read the schema by eye.
export const adminApiSchema = gql`
    ${tradingPointFields}

    # implements Node/PaginatedList (Counterparty/CounterpartyList below) — required for
    # @vendure/dashboard's Dashboard Counterparty ERP list (issue #133) to work at all, not just
    # for its auto-generated columns: without these, ListPage's generated list hook fails to bind
    # items/totalItems from the response even though the server returns real data over the wire
    # (confirmed live: the network response had a correct, non-empty items array, but the table
    # rendered "No results" regardless). Same gotcha already hit and fixed for ErpUser/ErpUserList
    # in access-control.plugin.ts (issue #119 Phase 1) — see that type's own comment.
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
        priceType: String!
        isActive: Boolean!
        assignedManagerId: String
        "Raw ERP manager id (1C) — fallback display when assignedManagerId hasn't resolved yet, see issue #133."
        managerErpId: String
        "The linked Customer's id, if any (read-only; the write path is issue #120's activation mutation)."
        linkedCustomerId: ID
        departmentId: String
        branchId: String
        creditTermOverrideExtraDays: Int
        "Free-text group/segment label from the ERP — display and filtering only."
        erpGroupLabel: String
        "Юридический адрес контрагента (1C) — display/completeness only, see issue #120 Decision 1."
        legalAddress: String
        "Фактический адрес контрагента (1C) — display/completeness only, see issue #120 Decision 1."
        factualAddress: String
        "Телефон контрагента (1C) — required with officialEmail before #120's portal-access activation."
        phone: String
        "Служебный адрес электронной почты контрагента (1C) — the real login-eligible email, see issue #120."
        officialEmail: String
        tradingPoints: [TradingPoint!]!
        "Additional managers beyond the Owner (assignedManagerId) — see CounterpartyTeamMember."
        teamMembers: [CounterpartyTeamMember!]!
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

        # Add/remove additional team members beyond the Owner — see CustomPermission.ManageCounterpartyTeam.
        addCounterpartyTeamMember(
            counterpartyId: ID!
            administratorId: ID!
            role: String!
            phone: String
        ): CounterpartyTeamMember!
        removeCounterpartyTeamMember(counterpartyId: ID!, administratorId: ID!): Boolean!

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

const shopResolvers = [
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
];

const adminResolvers = [
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CounterpartyResolver,
    CounterpartyCreditResolver,
    CounterpartyCustomerLinkResolver,
    TradingPointAdminResolver,
    CreditTermResolver,
    CounterpartyTeamFieldResolver,
    CounterpartyTeamMutationResolver,
];

@VendurePlugin({
    imports: [
        PluginCommonModule,
        CustomerPricingPlugin,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        VersioningPlugin,
    ],
    entities: [Counterparty, TradingPoint, ContactPerson, CounterpartyTeamMember],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: shopResolvers,
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: adminResolvers,
    },
    providers: [
        CounterpartyService,
        CounterpartyConsumer,
        TradingPointService,
        TradingPointConsumer,
        CreditTermGateService,
        CreditTermService,
        CounterpartyTeamService,
        AdministratorLinkedListener,
    ],
    exports: [CounterpartyService, TradingPointService],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Customer = [
            ...(config.customFields.Customer ?? []),
            {
                name: 'counterpartyId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Counterparty ID' }],
            },
            {
                name: 'portalRole',
                type: 'string' as const,
                nullable: true,
                defaultValue: 'buyer',
                label: [{ languageCode: LanguageCode.en, value: 'Portal role' }],
            },
            {
                name: 'preferredTradingPointId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Preferred trading point ID' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class CounterpartyPlugin {}
