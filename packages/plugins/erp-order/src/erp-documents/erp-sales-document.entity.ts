import { Column, Entity, Index } from 'typeorm';

import { boolCol, moneyCol, refCol, timeCol, varcharCol } from './columns';
import type { ErpRef } from './columns';
import { ErpDocumentBase } from './erp-document-base';

// One mirror for the sales-chain documents; kind is the stream name and attributes keep the header as received.
@Entity('erp_sales_document')
@Index(['erpId'], { unique: true })
@Index(['dealId'])
@Index(['basisDocumentId'])
@Index(['customerOrderId'])
export class ErpSalesDocument extends ErpDocumentBase {
    @Column({ type: 'varchar' })
    kind!: string;

    @Column({ type: 'varchar', default: '' })
    number!: string;

    @timeCol()
    date!: Date | null;

    @Column({ type: 'boolean', default: false })
    posted!: boolean;

    @Column({ type: 'boolean', default: false })
    deletionMarked!: boolean;

    @varcharCol()
    counterpartyId!: string | null;

    @varcharCol()
    contractId!: string | null;

    @varcharCol()
    organizationId!: string | null;

    @varcharCol()
    dealId!: string | null;

    @varcharCol()
    dealType!: string | null;

    @varcharCol()
    basisDocumentId!: string | null;

    @varcharCol()
    customerOrderId!: string | null;

    @varcharCol()
    currency!: string | null;

    @moneyCol()
    totalAmountMinor!: number | null;

    @boolCol()
    amountIncludesVat!: boolean | null;

    @Column({ type: 'boolean', default: false })
    truncated!: boolean;

    @refCol()
    rowCounts!: ErpRef | null;

    @Column({ type: 'jsonb', default: () => `'{}'` })
    attributes!: ErpRef;
}
