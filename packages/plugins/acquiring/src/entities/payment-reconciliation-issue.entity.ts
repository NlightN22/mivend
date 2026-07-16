import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type PaymentReconciliationIssueType =
    | 'DUPLICATE_OPERATION'
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'ORDER_MISMATCH'
    | 'ORGANIZATION_MISMATCH'
    | 'ERP_DOCUMENT_MISSING'
    | 'PLATFORM_PAYMENT_MISSING'
    | 'UNKNOWN_PROVIDER_OPERATION'
    | 'INVALID_STATE_TRANSITION'
    | 'REFUND_EXCEEDS_CAPTURED_AMOUNT';

export type PaymentReconciliationIssueStatus = 'open' | 'resolved' | 'ignored';

@Entity()
export class PaymentReconciliationIssue extends VendureEntity {
    constructor(input?: DeepPartial<PaymentReconciliationIssue>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    issueType!: PaymentReconciliationIssueType;

    @Index()
    @Column({ type: 'int', nullable: true })
    paymentId!: number | null;

    // See PaymentAttempt.invoiceId for why this is nullable — same "Invoice splitting not
    // implemented yet" caveat.
    @Column({ type: 'int', nullable: true })
    invoiceId!: number | null;

    @Column({ type: 'int', nullable: true })
    organizationId!: number | null;

    @Column({ type: 'varchar', nullable: true })
    providerPaymentId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    erpDocumentId!: string | null;

    @Column({ type: 'int', nullable: true })
    expectedAmount!: number | null;

    @Column({ type: 'int', nullable: true })
    actualAmount!: number | null;

    @Column({ type: 'varchar', nullable: true })
    expectedCurrency!: string | null;

    @Column({ type: 'varchar', nullable: true })
    actualCurrency!: string | null;

    @Column({ type: 'timestamp' })
    detectedAt!: Date;

    @Column({ type: 'varchar', default: 'open' })
    status!: PaymentReconciliationIssueStatus;

    @Column({ type: 'varchar', nullable: true })
    resolution!: string | null;
}
