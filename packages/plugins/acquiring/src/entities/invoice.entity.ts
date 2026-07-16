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
@Entity()
export class Invoice extends VendureEntity {
    constructor(input?: DeepPartial<Invoice>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    orderId!: number;

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
}
