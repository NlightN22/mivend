import { Entity, Index } from 'typeorm';

import {
    floatCol,
    floatZeroCol,
    moneyCol,
    moneyZeroCol,
    refCol,
    textCol,
    varcharCol,
} from './columns';
import type { ErpRef } from './columns';
import { ErpLineBase } from './erp-document-base';

@Entity('order_correction_goods_line_erp')
@Index('IDX_order_correction_goods_line_erp_document', ['documentId'])
export class OrderCorrectionGoodsLineErp extends ErpLineBase {
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

    @floatZeroCol()
    quantity!: number;

    @varcharCol()
    placesUnitId!: string | null;

    @floatCol()
    placesQuantity!: number | null;

    @moneyZeroCol()
    priceMinor!: number;

    @moneyZeroCol()
    amountMinor!: number;

    @varcharCol()
    vatCode!: string | null;

    @moneyCol()
    vatAmountMinor!: number | null;

    @floatCol()
    manualDiscountPercent!: number | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @refCol()
    automaticDiscountCondition!: ErpRef | null;

    @varcharCol()
    automaticDiscountConditionValue!: string | null;

    @refCol()
    placement!: ErpRef | null;

    @moneyCol()
    plannedCostMinor!: number | null;
}

@Entity('order_correction_service_line_erp')
@Index('IDX_order_correction_service_line_erp_document', ['documentId'])
export class OrderCorrectionServiceLineErp extends ErpLineBase {
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
    manualDiscountPercent!: number | null;

    @floatCol()
    automaticDiscountPercent!: number | null;

    @refCol()
    automaticDiscountCondition!: ErpRef | null;

    @varcharCol()
    automaticDiscountConditionValue!: string | null;
}

@Entity('order_correction_container_line_erp')
@Index('IDX_order_correction_container_line_erp_document', ['documentId'])
export class OrderCorrectionContainerLineErp extends ErpLineBase {
    @varcharCol()
    productId!: string | null;

    @floatZeroCol()
    quantity!: number;

    @moneyZeroCol()
    priceMinor!: number;

    @moneyZeroCol()
    amountMinor!: number;

    @refCol()
    placement!: ErpRef | null;
}
