import { Entity, Index } from 'typeorm';

import {
    boolCol,
    floatCol,
    floatZeroCol,
    intCol,
    moneyCol,
    moneyZeroCol,
    refCol,
    textCol,
    varcharCol,
} from './columns';
import type { ErpRef } from './columns';
import { ErpLineBase } from './erp-document-base';

@Entity('customer_claim_goods_line_erp')
@Index('IDX_customer_claim_goods_line_erp_document', ['documentId'])
export class CustomerClaimGoodsLineErp extends ErpLineBase {
    @intCol()
    linkKey!: number | null;

    @intCol()
    rowKey!: number | null;

    @varcharCol()
    productId!: string | null;

    @varcharCol()
    characteristicId!: string | null;

    @varcharCol()
    seriesId!: string | null;

    @varcharCol()
    unitId!: string | null;

    @floatCol()
    unitCoefficient!: number | null;

    @varcharCol()
    placesUnitId!: string | null;

    @floatCol()
    places!: number | null;

    @floatZeroCol()
    quantity!: number;

    @moneyZeroCol()
    priceMinor!: number;

    @moneyZeroCol()
    amountMinor!: number;

    @varcharCol()
    vatCode!: string | null;

    @moneyCol()
    vatAmountMinor!: number | null;

    @floatCol()
    weight!: number | null;

    @refCol()
    quality!: ErpRef | null;

    @varcharCol()
    warehouseId!: string | null;

    @refCol()
    returnDocument!: ErpRef | null;

    @boolCol()
    hasClaim!: boolean | null;

    @refCol()
    returnReason!: ErpRef | null;

    @refCol()
    decision!: ErpRef | null;

    @textCol()
    comment!: string | null;

    @varcharCol()
    inventoryDocumentId!: string | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @floatCol()
    manualDiscountPercent!: number | null;

    @varcharCol()
    orderId!: string | null;

    @varcharCol()
    saleDocumentId!: string | null;

    @varcharCol()
    receiptOrderId!: string | null;

    @moneyCol()
    costMinor!: number | null;

    @refCol()
    batchDocument!: ErpRef | null;

    @varcharCol()
    lineStatus!: string | null;

    @refCol()
    transferredTo!: ErpRef | null;

    @varcharCol()
    refusalReason!: string | null;
}

@Entity('customer_claim_service_line_erp')
@Index('IDX_customer_claim_service_line_erp_document', ['documentId'])
export class CustomerClaimServiceLineErp extends ErpLineBase {
    @varcharCol()
    productId!: string | null;

    @textCol()
    content!: string | null;

    @floatZeroCol()
    quantity!: number;

    @moneyZeroCol()
    priceMinor!: number;

    @moneyZeroCol()
    amountMinor!: number;

    @varcharCol()
    vatCode!: string | null;

    @moneyCol()
    vatAmountMinor!: number | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @floatCol()
    manualDiscountPercent!: number | null;

    @varcharCol()
    orderId!: string | null;

    @refCol()
    returnReason!: ErpRef | null;

    @textCol()
    comment!: string | null;

    @refCol()
    decision!: ErpRef | null;

    @boolCol()
    hasClaim!: boolean | null;

    @varcharCol()
    saleDocumentId!: string | null;
}
