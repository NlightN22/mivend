import { Column, Entity, Index } from 'typeorm';

import { boolCol, floatCol, moneyZeroCol, refCol, textCol, timeCol, varcharCol } from './columns';
import type { ErpRef } from './columns';
import { ErpDocumentBase } from './erp-document-base';

@Entity('customer_claim_erp')
@Index('IDX_customer_claim_erp_erp_id', ['erpId'], { unique: true })
@Index('IDX_customer_claim_erp_order', ['orderId'])
@Index('IDX_customer_claim_erp_counterparty', ['counterpartyId'])
export class CustomerClaimErp extends ErpDocumentBase {
    @Column({ type: 'varchar', default: '' })
    number!: string;

    @timeCol()
    date!: Date | null;

    @varcharCol()
    organizationId!: string | null;

    @varcharCol()
    counterpartyId!: string | null;

    @varcharCol()
    contractId!: string | null;

    @varcharCol()
    departmentId!: string | null;

    @varcharCol()
    responsibleId!: string | null;

    @varcharCol()
    projectId!: string | null;

    @varcharCol()
    warehouseId!: string | null;

    @varcharCol()
    orderId!: string | null;

    @refCol()
    basisDocument!: ErpRef | null;

    @varcharCol()
    currency!: string | null;

    @floatCol()
    exchangeRate!: number | null;

    @floatCol()
    exchangeMultiplicity!: number | null;

    @varcharCol()
    priceTypeId!: string | null;

    @varcharCol()
    salesConditionId!: string | null;

    @varcharCol()
    discountCardId!: string | null;

    @boolCol()
    vatAccounted!: boolean | null;

    @boolCol()
    amountIncludesVat!: boolean | null;

    @moneyZeroCol()
    totalAmountMinor!: number;

    @floatCol()
    totalWeight!: number | null;

    @textCol()
    comment!: string | null;

    @refCol()
    status!: ErpRef | null;

    @boolCol()
    hasClaim!: boolean | null;

    @boolCol()
    workedOut!: boolean | null;

    @refCol()
    receiptKind!: ErpRef | null;

    @boolCol()
    saleWasChanged!: boolean | null;

    @boolCol()
    saleDocumentsUpdatePending!: boolean | null;

    @refCol()
    transferDocument!: ErpRef | null;

    @refCol()
    goodsTransferDocument!: ErpRef | null;

    @refCol()
    supplierClaimDocument!: ErpRef | null;

    @refCol()
    internalMovementDocument!: ErpRef | null;
}
