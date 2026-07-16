import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type SettlementEntrySourceType =
    | 'payment.captured'
    | 'refund.succeeded'
    | 'chargeback.created'
    | 'order.created'
    | 'erp-reconciliation';

@Entity()
export class SettlementEntry extends VendureEntity {
    constructor(input?: DeepPartial<SettlementEntry>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    counterpartyId!: number;

    // See PaymentAttempt.invoiceId — same source-of-truth-on-Invoice reasoning. Once real
    // Invoice splitting lands, cash-application FIFO (docs/payments.md "Cash application") must
    // scope "open obligations" by (counterpartyId, organizationId) together — a debt owed to
    // our organization A must never be offset by a payment made to organization B.
    @Index()
    @Column({ type: 'int', nullable: true })
    invoiceId!: number | null;

    @Index()
    @Column({ type: 'int', nullable: true })
    organizationId!: number | null;

    @Column({ type: 'varchar' })
    sourceType!: SettlementEntrySourceType;

    @Column({ type: 'int', nullable: true })
    sourcePaymentId!: number | null;

    @Column({ type: 'int', nullable: true })
    sourceRefundId!: number | null;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'varchar' })
    currencyCode!: string;

    @Column({ type: 'boolean', default: false })
    reconciled!: boolean;

    @Index()
    @Column({ type: 'int', nullable: true })
    allocatedOrderId!: number | null;

    @Column({ type: 'int', nullable: true })
    allocationAmount!: number | null;
}
