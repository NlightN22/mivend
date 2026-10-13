import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type ProformaInvoiceKind = 'order-placed' | 'order-changed' | 'by-shipment';

export type ProformaInvoiceStatus = 'pending' | 'issued' | 'paid' | 'cancelled' | 'superseded';

export interface ProformaInvoiceLineSnapshot {
    variantId: number;
    sku: string;
    name: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    discounts: { description: string; amount: number }[];
    // Absent on snapshots issued before tax data was stored; taxRate null = rate not confirmed at issue time.
    taxRate?: number | null;
    taxCategoryName?: string | null;
    taxAmount?: number;
}

// One aggregate storefront Order can split into several ProformaInvoices — one per our own legal
// entity (OrganizationRequisites, plugin-documents) that owns the stock the order lines are
// fulfilled from. This split must be known and materialized *before* an online payment is
// requested — split-payment acquirers (ЮKassa "сплитование", Т-Банк "Мультирасчёты") require
// the full recipient/amount breakdown (`transfers`) at payment-creation time; there is no
// documented way to add or restructure recipients after the payment is created. See
// docs/payments.md "Organizations" for the full reasoning and open questions (issue TBD).
//
// Composite index on (counterpartyId, organizationId, status): this is exactly the filter shape
// SettlementEntryService.getOpenProformaInvoicesFifo runs on every successful payment (find open
// obligations for one counterparty within one organization) — the three separate single-column
// indexes below don't cover that combination efficiently once a counterparty accumulates many
// proforma invoices.
@Entity()
@Index(['counterpartyId', 'organizationId', 'status'])
@Index('UQ_proforma_invoice_number', ['number'], { unique: true })
@Index('UQ_proforma_invoice_order_org_version', ['orderId', 'organizationId', 'version'], {
    unique: true,
})
export class ProformaInvoice extends UuidEntity {
    constructor(input?: DeepPartial<ProformaInvoice>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    orderId!: number;

    // `<order number>-<NN>-<version>`: `<order number>-<NN>` is the stable document id per (order, organization).
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
    status!: ProformaInvoiceStatus;

    // Denormalized servicing branch, set at creation time from the customer's preferred
    // TradingPoint (mirrors Order.customFields.branchId in plugin-erp-order) — see
    // docs/access-control.md's "Branch scope is a separate axis" section. This is the real
    // access-scope filter for the manager portal, never Counterparty.branchId (a chain
    // customer's locations can span branches; filtering the parent record would be wrong).
    // Nullable: a customer with no trading point yet has no branch scope, same as Order's.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Immutable snapshot of the organization's order lines at issue time (#206).
    @Column({ type: 'jsonb', default: () => "'[]'" })
    lines!: ProformaInvoiceLineSnapshot[];

    // 1, 2, ...: a new version keeps the document id and bumps the last number part; the older one becomes `superseded`.
    @Column({ type: 'int', default: 1 })
    version!: number;

    @Column({ type: 'int', nullable: true })
    supersedesId!: number | null;

    @Column({ type: 'int', nullable: true })
    supersededById!: number | null;

    @Column({ type: 'timestamptz', default: () => 'now()' })
    issuedAt!: Date;

    @Column({ type: 'timestamptz', default: () => 'now()' })
    dueDate!: Date;

    @Column({ type: 'varchar', default: 'order-placed' })
    kind!: ProformaInvoiceKind;

    // Set only on a "by shipment" version: the ERP sales invoice (realization) it is based on.
    @Column({ type: 'varchar', nullable: true })
    salesInvoiceNumber!: string | null;

    // Set only when a manager withdrew this version without a replacement.
    @Column({ type: 'timestamptz', nullable: true })
    withdrawnAt!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    withdrawnByAdministratorId!: string | null;
}
