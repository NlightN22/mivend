import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const adminApiExtensions: DocumentNode = gql`
    "Mirrors shop.schema.ts's InvoiceOrder — a lightweight ref, not the full core Order type."
    type InvoiceOrder {
        id: ID!
        code: String!
    }

    type Invoice {
        id: ID!
        orderId: ID!
        organizationId: ID!
        counterpartyId: ID!
        amount: Int!
        currencyCode: String!
        status: String!
        branchId: ID
        "Resolved via InvoiceFieldResolver.order — was previously registered only for shopApiExtensions, so no admin client could ever request it (real bug: InvoicesTable.vue linked to /orders/<orderId> instead of /orders/<order.code>, landing on a broken page)."
        order: InvoiceOrder!
        "Resolved via InvoiceFieldResolver.lines — must be declared here too: registering InvoiceFieldResolver without declaring every field it resolves throws 'Invoice.lines defined in resolvers, but not in schema' at bootstrap (real incident, caught before merging)."
        lines: [OrderLine!]!
    }

    type InvoiceList {
        items: [Invoice!]!
        totalItems: Int!
    }

    type MoneyAmount {
        amount: Int!
        currencyCode: String!
    }

    input InvoiceListOptions {
        take: Int
        skip: Int
        status: String
        "Substring match against the invoice's own numeric id (cast to text) — see InvoiceListOptions's server-side doc comment (invoice.service.ts) for why this, not a real document-number field, is what search means today."
        search: String
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

    type OrderPaymentSummary {
        orderId: ID!
        "Sum of paymentStatus='captured' PaymentAttempt rows for this order — see PaymentAttemptService.sumCapturedAmountsByOrderIds for what's deliberately not netted out (refunds/disputes)."
        capturedAmount: Int!
    }

    extend type Query {
        invoicesForOrder(orderId: ID!): [Invoice!]!
        "Seed-script helper only — lists real captured online-acquiring payments to attach mock refunds/disputes to (AGENTS.md Dev seed rules exception, see seed-payment-refunds.mjs)."
        capturedOnlinePayments(take: Int): [PaymentAttempt!]!
        "Seed-script idempotency helper only — see seed-payment-refunds.mjs."
        paymentRefundExists(providerRefundId: String!): Boolean!
        "Seed-script idempotency helper only — see seed-payment-refunds.mjs."
        paymentDisputeExists(paymentId: ID!, type: String!): Boolean!
        "Manager-portal invoice list, branch-scoped via AccessScopeService.resolveInvoiceScope — see AdminInvoiceVisibilityResolver / docs/access-control.md."
        visibleInvoices(options: InvoiceListOptions, counterpartyId: ID): InvoiceList!
        "Manager-portal payment list — derived-from-Invoice scoping, see PaymentVisibilityService."
        visiblePayments(options: PaymentListOptions, counterpartyId: ID): PaymentAttemptList!
        "Sum of a counterparty's unpaid (pending/issued) invoices, scoped the same way visibleInvoices is. Null if the counterparty has no unpaid invoices, not zero-with-a-currency."
        invoiceOutstandingBalance(counterpartyId: ID!): MoneyAmount
        "Batched captured-payment total per order, for the manager portal's order-list Payment badge. Returns one summary per orderId requested, capturedAmount 0 if none captured yet."
        orderPaymentSummaries(orderIds: [ID!]!): [OrderPaymentSummary!]!
        "Real DB-level filtered + paginated order list for one customer, bucketed by real captured-payment status (unpaid/partial/paid) — see AdminOrderPaymentViewResolver. Used by CustomerOrdersTab.vue's Unpaid/Partially paid/Paid view chips."
        customerOrdersByPaymentView(
            customerId: ID!
            paymentView: String!
            options: OrderListOptions
        ): OrderList!
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
