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

@Entity('sales_correction_goods_line_erp')
@Index('IDX_sales_correction_goods_line_erp_document', ['documentId'])
export class SalesCorrectionGoodsLineErp extends ErpLineBase {
    @varcharCol()
    lineId!: string | null;

    @varcharCol()
    productId!: string | null;

    @varcharCol()
    characteristicId!: string | null;

    @varcharCol()
    seriesId!: string | null;

    @varcharCol()
    unitId!: string | null;

    @floatZeroCol()
    unitCoefficient!: number;

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
    quantityBeforeCorrection!: number | null;

    @moneyCol()
    priceBeforeCorrectionMinor!: number | null;

    @moneyCol()
    amountBeforeCorrectionMinor!: number | null;

    @moneyCol()
    vatAmountBeforeCorrectionMinor!: number | null;

    @floatCol()
    quantityBeforeChange!: number | null;

    @moneyCol()
    priceBeforeChangeMinor!: number | null;

    @moneyCol()
    amountBeforeChangeMinor!: number | null;

    @moneyCol()
    vatAmountBeforeChangeMinor!: number | null;

    @varcharCol()
    vatCodeBeforeChange!: string | null;

    @floatCol()
    manualDiscountPercent!: number | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @refCol()
    automaticDiscountCondition!: ErpRef | null;

    @varcharCol()
    automaticDiscountConditionValue!: string | null;

    @varcharCol()
    orderId!: string | null;

    @varcharCol()
    warehouseId!: string | null;

    @refCol()
    quality!: ErpRef | null;

    @refCol()
    writeOffMethod!: ErpRef | null;

    @boolCol()
    inSaleDocument!: boolean | null;

    @boolCol()
    reflectInStock!: boolean | null;

    @boolCol()
    traceable!: boolean | null;

    @varcharCol()
    belongsTo!: string | null;

    @refCol()
    originCountry!: ErpRef | null;

    @refCol()
    customsCode!: ErpRef | null;

    @refCol()
    customsCodeBeforeChange!: ErpRef | null;

    @varcharCol()
    placesUnitId!: string | null;

    @floatCol()
    placesQuantity!: number | null;

    @intCol()
    linkKey!: number | null;

    @intCol()
    rowKey!: number | null;

    @floatZeroCol()
    shippedDelta!: number;
}

@Entity('sales_correction_service_line_erp')
@Index('IDX_sales_correction_service_line_erp_document', ['documentId'])
export class SalesCorrectionServiceLineErp extends ErpLineBase {
    @varcharCol()
    productId!: string | null;

    @textCol()
    content!: string | null;

    @textCol()
    contentBeforeChange!: string | null;

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
    quantityBeforeCorrection!: number | null;

    @moneyCol()
    priceBeforeCorrectionMinor!: number | null;

    @moneyCol()
    amountBeforeCorrectionMinor!: number | null;

    @moneyCol()
    vatAmountBeforeCorrectionMinor!: number | null;

    @floatCol()
    quantityBeforeChange!: number | null;

    @moneyCol()
    priceBeforeChangeMinor!: number | null;

    @moneyCol()
    amountBeforeChangeMinor!: number | null;

    @moneyCol()
    vatAmountBeforeChangeMinor!: number | null;

    @varcharCol()
    vatCodeBeforeChange!: string | null;

    @floatCol()
    manualDiscountPercent!: number | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @refCol()
    automaticDiscountCondition!: ErpRef | null;

    @varcharCol()
    automaticDiscountConditionValue!: string | null;

    @varcharCol()
    orderId!: string | null;

    @boolCol()
    inSaleDocument!: boolean | null;

    @boolCol()
    reflectInStock!: boolean | null;
}
