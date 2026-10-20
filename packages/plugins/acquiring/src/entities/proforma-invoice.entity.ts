import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type ProformaInvoiceKind =
    | 'order-placed'
    | 'order-changed'
    | 'by-shipment'
    | 'debt-repayment'
    | 'advance';

// Contract payment requests (#260): paper with requisites, never an open document for payment allocation.
export const CONTRACT_PAYMENT_KINDS: ProformaInvoiceKind[] = ['debt-repayment', 'advance'];

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

// Split must be known before payment creation: split-payment acquirers need full transfers up front.
// Composite index matches the per-counterparty, per-organization FIFO lookup run on every payment.
@Entity()
@Index(['counterpartyId', 'organizationId', 'status'])
@Index('UQ_proforma_invoice_number', ['number'], { unique: true })
@Index('UQ_proforma_invoice_order_org_version', ['orderId', 'organizationId', 'version'], {
    unique: true,
})
@Index('UQ_proforma_invoice_idempotency', ['counterpartyId', 'idempotencyKey'], {
    unique: true,
    where: '"idempotencyKey" IS NOT NULL',
})
export class ProformaInvoice extends UuidEntity {
    constructor(input?: DeepPartial<ProformaInvoice>) {
        super(input);
    }

    // Null only for contract payment kinds, which belong to a contract, not an order.
    @Index()
    @Column({ type: 'int', nullable: true })
    orderId!: number | null;

    // `<order number>-<NN>-<version>` (stable id `<order number>-<NN>`); a flat sequence number for contract kinds.
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

    // Real access-scope filter for the manager portal. Not Counterparty.branchId: chain customers
    // span branches, so the parent record's branch would be wrong. Null when no trading point.
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

    // Contract payment kinds only.
    @Column({ type: 'varchar', nullable: true })
    contractId!: string | null;

    // Issue-time contract name, printed in the payment purpose even if the ERP renames the contract later.
    @Column({ type: 'varchar', nullable: true })
    contractName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    idempotencyKey!: string | null;
}
