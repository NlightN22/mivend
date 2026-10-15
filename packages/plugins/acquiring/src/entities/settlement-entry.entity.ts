import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type SettlementEntrySourceType =
    | 'payment.captured'
    | 'refund.succeeded'
    | 'chargeback.created'
    | 'order.created'
    | 'erp-reconciliation';

@Entity()
export class SettlementEntry extends UuidEntity {
    constructor(input?: DeepPartial<SettlementEntry>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    counterpartyId!: number;

    // Once ProformaInvoice splitting lands, FIFO cash application must scope open obligations
    // by (counterpartyId, organizationId) jointly: org A debt must never be offset by org B payment.
    @Index()
    @Column({ type: 'int', nullable: true })
    proformaInvoiceId!: number | null;

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
