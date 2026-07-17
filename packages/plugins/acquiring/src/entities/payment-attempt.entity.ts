import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
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

@Entity()
export class PaymentAttempt extends VendureEntity {
    constructor(input?: DeepPartial<PaymentAttempt>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    channel!: PaymentChannel;

    // The Invoice this payment settles — one per our own legal entity (organizationId lives on
    // Invoice, not here, to keep a single source of truth). For online-acquiring, the Invoice
    // must exist *before* this PaymentAttempt is created — split-payment acquirers need the
    // full organization/amount breakdown upfront (see Invoice's own doc comment). Nullable only
    // for channels/flows that predate real Invoice splitting (see docs/payments.md
    // "Organizations" open question, issue TBD).
    @Index()
    @Column({ type: 'int', nullable: true })
    invoiceId!: number | null;

    @Index()
    @Column({ type: 'int', nullable: true })
    orderId!: number | null;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'varchar' })
    currencyCode!: string;

    // Mandatory for every channel — an RRN from a card terminal, a branch kassa's own fiscal
    // receipt/cheque number, an ERP payment-document id, or (until a real acquirer is wired in)
    // a clearly-marked stub value generated server-side. Without this, a payment can never be
    // reconciled against the external system that actually witnessed it (the acquirer, the
    // branch kassa, or 1C) — see docs/payments.md.
    @Index()
    @Column({ type: 'varchar' })
    providerPaymentId!: string;

    @Column({ type: 'varchar', default: 'pending' })
    paymentStatus!: PaymentStatus;

    @Column({ type: 'varchar', default: 'notRequired' })
    erpPostingStatus!: ErpPostingStatus;
}
