import { Column, Entity, Index } from 'typeorm';

import { boolCol, floatCol, moneyZeroCol, refCol, textCol, timeCol, varcharCol } from './columns';
import type { ErpRef } from './columns';
import { ErpDocumentBase } from './erp-document-base';

// setComponents, serialNumbers, setSerialNumbers, packageBarcodes and traceability are kept as received (jsonb lists).
@Entity('sales_correction_erp')
@Index('IDX_sales_correction_erp_erp_id', ['erpId'], { unique: true })
@Index('IDX_sales_correction_erp_order', ['orderId'])
@Index('IDX_sales_correction_erp_counterparty', ['counterpartyId'])
export class SalesCorrectionErp extends ErpDocumentBase {
    @Column({ type: 'varchar', default: '' })
    number!: string;

    @timeCol()
    date!: Date | null;

    @refCol()
    operationKind!: ErpRef | null;

    @refCol()
    correctedDocument!: ErpRef | null;

    @refCol()
    basisDocument!: ErpRef | null;

    @varcharCol()
    orderId!: string | null;

    @varcharCol()
    counterpartyId!: string | null;

    @varcharCol()
    contractId!: string | null;

    @varcharCol()
    organizationId!: string | null;

    @varcharCol()
    departmentId!: string | null;

    @varcharCol()
    warehouseId!: string | null;

    @varcharCol()
    responsibleId!: string | null;

    @refCol()
    project!: ErpRef | null;

    @varcharCol()
    currency!: string | null;

    @floatCol()
    exchangeRate!: number | null;

    @floatCol()
    exchangeMultiplicity!: number | null;

    @moneyZeroCol()
    totalAmountMinor!: number;

    @boolCol()
    vatAccounted!: boolean | null;

    @boolCol()
    amountIncludesVat!: boolean | null;

    @boolCol()
    correctVat!: boolean | null;

    @boolCol()
    correctAccountingAndTax!: boolean | null;

    @varcharCol()
    priceTypeId!: string | null;

    @refCol()
    salesCondition!: ErpRef | null;

    @refCol()
    discountCard!: ErpRef | null;

    @textCol()
    deliveryAddress!: string | null;

    @textCol()
    deliveryAddressAddition!: string | null;

    @varcharCol()
    consignorId!: string | null;

    @varcharCol()
    consigneeId!: string | null;

    @varcharCol()
    bankAccountId!: string | null;

    @refCol()
    transferKind!: ErpRef | null;

    @textCol()
    comment!: string | null;

    @refCol()
    accounting!: ErpRef | null;

    @Column({ type: 'jsonb', default: () => `'[]'` })
    setComponents!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: () => `'[]'` })
    serialNumbers!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: () => `'[]'` })
    setSerialNumbers!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: () => `'[]'` })
    packageBarcodes!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: () => `'[]'` })
    traceability!: Record<string, unknown>[];
}
