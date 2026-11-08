import { Column, Entity, Index } from 'typeorm';

import { textCol, varcharCol } from './columns';
import { ErpDocumentBase } from './erp-document-base';

// History-only reply to an order change command; requestId and orderId are the ERP's ids, no foreign keys.
@Entity('order_change_result_erp')
@Index('IDX_order_change_result_erp_erp_id', ['erpId'], { unique: true })
@Index('IDX_order_change_result_erp_order', ['orderId'])
export class OrderChangeResultErp extends ErpDocumentBase {
    @varcharCol()
    requestId!: string | null;

    @varcharCol()
    orderId!: string | null;

    @Column({ type: 'varchar', default: '' })
    status!: string;

    @varcharCol()
    rejectionCode!: string | null;

    @textCol()
    rejectionMessage!: string | null;
}
