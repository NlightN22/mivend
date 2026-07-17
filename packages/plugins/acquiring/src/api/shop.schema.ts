import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const shopApiExtensions: DocumentNode = gql`
    type InvoiceLineProductVariant {
        name: String!
        sku: String!
    }

    type InvoiceLine {
        productVariant: InvoiceLineProductVariant!
        quantity: Int!
        unitPriceWithTax: Int!
        linePriceWithTax: Int!
    }

    type InvoiceOrder {
        id: ID!
        code: String!
    }

    type Invoice {
        id: ID!
        orderId: ID!
        organizationId: ID!
        amount: Int!
        currencyCode: String!
        status: String!
        lines: [InvoiceLine!]!
        order: InvoiceOrder!
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

    type MoneyAmount {
        amount: Int!
        currencyCode: String!
    }

    # docs/payments.md: a payment is a money-movement fact, independent from Invoice (the
    # obligation) — one payment can settle several invoices (cash application) or none at all
    # (a pure advance). "status" mirrors PaymentAttempt.paymentStatus (pending/authorized/
    # captured/failed/canceled/... — see the entity for the full set); "channel" mirrors
    # PaymentAttempt.channel (online-acquiring/branch-kassa/bank-transfer-erp).
    # Named "PaymentAttempt", not "Payment" — @vendure/core already registers its own "Payment"
    # GraphQL type (tied to Order), and two types sharing a name crashes schema build with
    # "Field already exists in the schema" (same collision class as PaymentRefund/Refund, see
    # AGENTS.md's Vendure gotchas).
    type PaymentAttempt {
        id: ID!
        invoiceId: ID
        orderId: ID
        amount: Int!
        currencyCode: String!
        channel: String!
        status: String!
        createdAt: DateTime!
        invoice: Invoice
        order: InvoiceOrder
        allocations: [PaymentAllocation!]!
        # The originating system's own reference for this payment (PaymentAttempt.providerPaymentId):
        # an ERP payment-document id for bank-transfer-erp, an RRN (Retrieval Reference Number,
        # the standard card/terminal transaction reference) for branch-kassa when one was
        # witnessed. Null for online-acquiring until a real acquirer is integrated (Robokassa —
        # see docs/payments.md), and null for any payment that predates this field.
        externalReference: String
        # Modeled on a real acquirer's refund API (Robokassa's RefundOperation) — see
        # PaymentRefundService. Only online-acquiring realistically produces these today; other
        # channels return an empty list (see docs/payments.md's refund-feasibility note).
        refunds: [PaymentRefund!]!
        disputes: [Dispute!]!
    }

    type PaymentRefund {
        id: ID!
        amount: Int!
        status: String!
        providerRefundId: String
        reason: String!
        createdAt: DateTime!
    }

    type Dispute {
        id: ID!
        type: String!
        status: String!
        amount: Int!
        openedAt: DateTime!
    }

    type PaymentAllocation {
        invoice: Invoice
        amount: Int!
        isAdvance: Boolean!
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

    extend type Query {
        # Scoped to the current customer's own counterparty — see InvoiceShopResolver.
        myInvoices(options: InvoiceListOptions): InvoiceList!
        invoice(id: ID!): Invoice
        # Unallocated credit accumulated from cash application (docs/payments.md "Cash
        # application") — a captured payment whose amount exceeded what was owed on its target
        # invoice, with no other open invoice to absorb the remainder. One entry per currency.
        myAdvanceBalance: [MoneyAmount!]!
        myPayments(options: PaymentListOptions): PaymentAttemptList!
        payment(id: ID!): PaymentAttempt
    }

    extend type Mutation {
        # Pays a single invoice directly, independent of Vendure's Order/Payment/activeOrder —
        # payable any time, regardless of the underlying order's own state. "status" is the
        # demo-stub outcome: "success" | "pending" | "fail" | "cancel" (mirrors the online-stub
        # payment method's own status metadata arg). "channel" defaults to "online-acquiring";
        # pass "bank-transfer-erp" to simulate the ERP reporting a bank transfer for the same
        # invoice, or "branch-kassa" for a till payment — no real acquirer/kassa/bank-statement
        # integration exists yet (docs/payments.md), this is a demo stub for all three.
        payInvoice(invoiceId: ID!, status: String!, channel: String): Invoice!
    }
`;
