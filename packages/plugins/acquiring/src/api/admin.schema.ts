import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const adminApiExtensions: DocumentNode = gql`
    type Invoice {
        id: ID!
        orderId: ID!
        organizationId: ID!
        counterpartyId: ID!
        amount: Int!
        currencyCode: String!
        status: String!
        branchId: ID
    }

    type InvoiceList {
        items: [Invoice!]!
        totalItems: Int!
    }

    input InvoiceListOptions {
        take: Int
        skip: Int
        status: String
    }

    type PaymentInboxSweepResult {
        processed: Int!
        failed: Int!
    }

    type PaymentAttempt {
        id: ID!
        channel: String!
        paymentStatus: String!
        amount: Int!
        currencyCode: String!
        invoiceId: ID
        "Only populated when returned from visiblePayments (joined from its Invoice) — null elsewhere."
        counterpartyId: ID
    }

    type PaymentAttemptList {
        items: [PaymentAttempt!]!
        totalItems: Int!
    }

    input PaymentListOptions {
        take: Int
        skip: Int
        status: String
        channel: String
    }

    type PaymentRefund {
        id: ID!
        paymentId: ID!
        amount: Int!
        status: String!
        providerRefundId: String
        reason: String!
    }

    type Dispute {
        id: ID!
        paymentId: ID!
        type: String!
        status: String!
        amount: Int!
    }

    extend type Query {
        invoicesForOrder(orderId: ID!): [Invoice!]!
        "Seed-script helper only — lists real captured online-acquiring payments to attach mock refunds/disputes to (AGENTS.md Dev seed rules exception, see seed-payment-refunds.mjs)."
        capturedOnlinePayments(take: Int): [PaymentAttempt!]!
        "Manager-portal invoice list, branch-scoped via AccessScopeService.resolveInvoiceScope — see AdminInvoiceVisibilityResolver / docs/access-control.md."
        visibleInvoices(options: InvoiceListOptions, counterpartyId: ID): InvoiceList!
        "Manager-portal payment list — derived-from-Invoice scoping, see PaymentVisibilityService."
        visiblePayments(options: PaymentListOptions, counterpartyId: ID): PaymentAttemptList!
    }

    extend type Mutation {
        "Manually runs one payment inbox sweep immediately, instead of waiting for the periodic worker. Ops/test visibility only — does not change the async processing contract (AGENTS.md sync rule #12): this still goes through the same InboxService.claimBatch/PaymentInboxProcessorService path the timer uses, it just runs it on demand."
        triggerPaymentInboxSweep: PaymentInboxSweepResult!
        "Records a real PaymentRefund row (AGENTS.md sync rule #11: a refund is its own entity, never a negative payment record), modeled on Robokassa's RefundOperation API — providerRefundId mirrors Robokassa's OpKey."
        recordPaymentRefund(
            paymentId: ID!
            amount: Int!
            reason: String!
            providerRefundId: String
            status: String
        ): PaymentRefund!
        "Records a real Dispute/chargeback row for a payment — its own lifecycle, never folded into PaymentAttempt.paymentStatus."
        recordPaymentDispute(paymentId: ID!, type: String!, amount: Int!, status: String): Dispute!
    }
`;
