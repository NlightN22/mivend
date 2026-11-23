import { Column, Entity, Index } from 'typeorm';

import { floatCol, moneyCol, varcharCol } from './columns';
import type { ErpRef } from './columns';
import { ErpLineBase } from './erp-document-base';

// One row of any table part of an ERP sales document; part names the table part (goods, services, payment breakdown ...).
@Entity('erp_sales_document_line')
@Index(['documentId'])
@Index(['linkedId'])
export class ErpSalesDocumentLine extends ErpLineBase {
    @Column({ type: 'varchar' })
    part!: string;

    @varcharCol()
    linkedId!: string | null;

    @varcharCol()
    productId!: string | null;

    @floatCol()
    quantity!: number | null;

    @floatCol()
    coefficient!: number | null;

    @moneyCol()
    amountMinor!: number | null;

    @moneyCol()
    vatAmountMinor!: number | null;

    @Column({ type: 'jsonb', default: () => `'{}'` })
    attributes!: ErpRef;
}
