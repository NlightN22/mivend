import gql from 'graphql-tag';

export const adminApiSchema = gql`
    type Reservation {
        id: ID!
        orderId: ID!
        orderLineId: ID!
        productVariantId: ID!
        quantity: Int!
        status: String!
        reservedAt: DateTime!
        expiresAt: DateTime!
        releasedAt: DateTime
        stockLocationId: ID!
        creationMethod: String!
        confirmedByAdministratorId: ID
        interventionFlaggedAt: DateTime
        erpOperationId: String!
        erpReleaseOperationId: String
        erpConfirmedAt: DateTime
    }

    type ReservationExtensionLimit {
        roleCode: String!
        maxExtraDays: Int!
    }

    type ReservationReconciliationIssue {
        id: ID!
        issueType: String!
        orderId: ID!
        productVariantId: ID
        localQuantity: Int
        erpQuantity: Int
        externalProductId: String
        orderEntityId: ID!
        detectedAt: DateTime!
        status: String!
    }

    type ReservationReconciliationIssueList {
        items: [ReservationReconciliationIssue!]!
        totalItems: Int!
    }

    input OpenReservationReconciliationIssueListOptions {
        take: Int
        skip: Int
    }

    type OrderContractOption {
        erpId: String!
        name: String
        organizationId: String!
        organizationName: String
        paymentKind: String
        isMain: Boolean!
        isSelected: Boolean!
    }

    extend type Query {
        "Active contracts of the order's counterparty; the one the order is registered under is marked (#205)."
        orderContracts(orderId: ID!): [OrderContractOption!]!
        orderReservations(orderId: ID!): [Reservation!]!
        availableStock(productVariantId: ID!, orderId: ID): Int!
        reservationExtensionLimit(roleCode: String!): ReservationExtensionLimit
        "Open reservation/ERP drift issues, newest first — for the manager-portal dashboard's integration-health panel (issue #76)."
        openReservationReconciliationIssues(
            options: OpenReservationReconciliationIssueListOptions
        ): ReservationReconciliationIssueList!
    }

    extend type Mutation {
        confirmOrder(orderId: ID!, reservationDays: Int!): [Reservation!]!
        releaseOrderReservation(orderId: ID!): Int!
        "Change the contract the order is registered under; only before it is reserved (#205)."
        setOrderContract(orderId: ID!, contractId: String!): [OrderContractOption!]!
        extendOrderReservation(orderId: ID!, additionalDays: Int!): [Reservation!]!
        setReservationExtensionLimit(
            roleCode: String!
            maxExtraDays: Int!
        ): ReservationExtensionLimit!
    }
`;
