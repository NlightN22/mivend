import { Column, Entity, Index } from 'typeorm';

import {
    boolCol,
    floatCol,
    moneyCol,
    moneyZeroCol,
    refCol,
    textCol,
    timeCol,
    varcharCol,
} from './columns';
import type { ErpRef } from './columns';
import { ErpDocumentBase } from './erp-document-base';

@Entity('order_correction_erp')
@Index('IDX_order_correction_erp_erp_id', ['erpId'], { unique: true })
@Index('IDX_order_correction_erp_order', ['orderId'])
@Index('IDX_order_correction_erp_counterparty', ['counterpartyId'])
export class OrderCorrectionErp extends ErpDocumentBase {
    @Column({ type: 'varchar', default: '' })
    number!: string;

    @timeCol()
    date!: Date | null;

    @varcharCol()
    orderId!: string | null;

    @varcharCol()
    counterpartyId!: string | null;

    @varcharCol()
    organizationId!: string | null;

    @varcharCol()
    responsibleId!: string | null;

    @varcharCol()
    priceTypeId!: string | null;

    @boolCol()
    vatAccounted!: boolean | null;

    @boolCol()
    amountIncludesVat!: boolean | null;

    @floatCol()
    exchangeRate!: number | null;

    @floatCol()
    exchangeMultiplicity!: number | null;

    @moneyZeroCol()
    totalAmountMinor!: number;

    @textCol()
    comment!: string | null;

    @refCol()
    discountCard!: ErpRef | null;

    @refCol()
    salesCondition!: ErpRef | null;

    @refCol()
    structuralUnit!: ErpRef | null;

    @moneyCol()
    plannedCostTotalMinor!: number | null;

    @boolCol()
    usePlannedCost!: boolean | null;

    @refCol()
    accounting!: ErpRef | null;
}
