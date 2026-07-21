import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type InvoiceStatus = 'pending' | 'issued' | 'paid' | 'cancelled';

// One aggregate storefront Order can split into several Invoices — one per our own legal
// entity (OrganizationRequisites, plugin-documents) that owns the stock the order lines are
// fulfilled from. This split must be known and materialized *before* an online payment is
// requested — split-payment acquirers (ЮKassa "сплитование", Т-Банк "Мультирасчёты") require
// the full recipient/amount breakdown (`transfers`) at payment-creation time; there is no
// documented way to add or restructure recipients after the payment is created. See
// docs/payments.md "Organizations" for the full reasoning and open questions (issue TBD).
//
// Composite index on (counterpartyId, organizationId, status): this is exactly the filter shape
// SettlementEntryService.getOpenInvoicesFifo runs on every successful payment (find open
// obligations for one counterparty within one organization) — the three separate single-column
// indexes below don't cover that combination efficiently once a counterparty accumulates many
// invoices.
@Entity()
@Index(['counterpartyId', 'organizationId', 'status'])
export class Invoice extends VendureEntity {
    constructor(input?: DeepPartial<Invoice>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    orderId!: number;

    // The invoice's own human-facing business number — generated at creation (see
    // InvoiceService.createInvoicesForOrder) via shared/src/documentCode.ts's
    // generateDocumentCode('INV'), the same generation principle as Order.code/PaymentAttempt.
    // number/DiscountGrant.number but with its own distinct prefix — reusing Order.code directly
    // here would give every invoice split off one order the same visible identity as that order,
    // indistinguishable from it in a shared list. `orderId` (below) is the real, queryable link
    // back to the order; this column is Invoice's own identity, not a derived alias of Order's.
    @Index()
    @Column({ type: 'varchar' })
    number!: string;

    @Index()
    @Column({ type: 'int' })
    organizationId!: number;

    @Index()
    @Column({ type: 'int' })
    counterpartyId!: number;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'varchar' })
    currencyCode!: string;

    @Column({ type: 'varchar', default: 'pending' })
    status!: InvoiceStatus;

    // Denormalized servicing branch, set at creation time from the customer's preferred
    // TradingPoint (mirrors Order.customFields.branchId in plugin-erp-order) — see
    // docs/access-control.md's "Branch scope is a separate axis" section. This is the real
    // access-scope filter for the manager portal, never Counterparty.branchId (a chain
    // customer's locations can span branches; filtering the parent record would be wrong).
    // Nullable: a customer with no trading point yet has no branch scope, same as Order's.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;
}
