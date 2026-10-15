import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type PaymentChannel = 'online-acquiring' | 'branch-kassa' | 'bank-transfer-erp';

export type PaymentStatus =
    | 'pending'
    | 'authorized'
    | 'captured'
    | 'failed'
    | 'canceled'
    | 'partiallyRefunded'
    | 'refunded'
    | 'disputed'
    | 'chargeback';

export type ErpPostingStatus =
    | 'notRequired'
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'retrying'
    | 'reconciliationRequired';

// Not providerPaymentId alone: channels pick their own reference formats and may collide.
// DB-level backstop for the app-level check in PaymentAttemptService.payProformaInvoice (race).
@Entity()
@Index(['channel', 'providerPaymentId'], { unique: true })
export class PaymentAttempt extends UuidEntity {
    constructor(input?: DeepPartial<PaymentAttempt>) {
        super(input);
    }

    // Internal document number from a flat NumberingService sequence; never the same field as
    // providerPaymentId, which is the external system's reference for reconciliation.
    @Index()
    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'varchar' })
    channel!: PaymentChannel;

    // Must exist before the attempt for online acquiring; split-payment needs the breakdown upfront.
    // Nullable only for legacy channels that predate proforma splitting.
    @Index()
    @Column({ type: 'int', nullable: true })
    proformaInvoiceId!: number | null;

    @Index()
    @Column({ type: 'int', nullable: true })
    orderId!: number | null;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'varchar' })
    currencyCode!: string;

    // Mandatory for every channel: without it the payment can't be reconciled with the external system.
    // Until an acquirer is wired, a server-generated stub is allowed if clearly marked.
    @Index()
    @Column({ type: 'varchar' })
    providerPaymentId!: string;

    @Column({ type: 'varchar', default: 'pending' })
    paymentStatus!: PaymentStatus;

    @Column({ type: 'varchar', default: 'notRequired' })
    erpPostingStatus!: ErpPostingStatus;
}
