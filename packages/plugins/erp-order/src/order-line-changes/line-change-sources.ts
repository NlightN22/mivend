import type { CustomerClaimErp } from '../erp-documents/customer-claim-erp.entity';
import type {
    CustomerClaimGoodsLineErp,
    CustomerClaimServiceLineErp,
} from '../erp-documents/customer-claim-line-erp.entity';
import type { SalesCorrectionErp } from '../erp-documents/sales-correction-erp.entity';
import type {
    SalesCorrectionGoodsLineErp,
    SalesCorrectionServiceLineErp,
} from '../erp-documents/sales-correction-line-erp.entity';
import { isReflectedInAccounting } from './line-change-accounting';
import type { LineChangeSource } from './line-change.types';

// Order.totalWithTax includes VAT, so an amount the ERP states without VAT gets the line's VAT added.
function withVat(includesVat: boolean | null, amount: number, vat: number | null): number {
    return includesVat === false ? amount + (vat ?? 0) : amount;
}

function correctionMoney(
    doc: SalesCorrectionErp,
    line: SalesCorrectionGoodsLineErp | SalesCorrectionServiceLineErp,
): number {
    const now = withVat(doc.amountIncludesVat, line.amountMinor, line.vatAmountMinor);
    const before =
        line.amountBeforeCorrectionMinor === null
            ? now
            : withVat(
                  doc.amountIncludesVat,
                  line.amountBeforeCorrectionMinor,
                  line.vatAmountBeforeCorrectionMinor,
              );
    return now - before;
}

// Quantity change of a correction line in base units; shippedDelta is the fallback when the old value is not sent.
export function correctionGoodsSource(
    doc: SalesCorrectionErp,
    line: SalesCorrectionGoodsLineErp,
): LineChangeSource {
    const delta =
        line.quantityBeforeCorrection === null
            ? line.shippedDelta
            : line.quantity - line.quantityBeforeCorrection;
    return {
        kind: 'realization-correction',
        productErpId: line.productId ?? '',
        quantity: delta * (line.unitCoefficient || 1),
        amountMinor: correctionMoney(doc, line),
        reflectedInAccounting: isReflectedInAccounting(doc.accounting),
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}

export function correctionServiceSource(
    doc: SalesCorrectionErp,
    line: SalesCorrectionServiceLineErp,
): LineChangeSource {
    return {
        kind: 'realization-correction',
        productErpId: '',
        quantity: 0,
        amountMinor: correctionMoney(doc, line),
        reflectedInAccounting: isReflectedInAccounting(doc.accounting),
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}

// A claim document has no accounting attribute, so it is never customer-visible.
export function claimGoodsSource(
    doc: CustomerClaimErp,
    line: CustomerClaimGoodsLineErp,
): LineChangeSource {
    return {
        kind: 'return',
        productErpId: line.productId ?? '',
        quantity: -line.quantity * (line.unitCoefficient || 1),
        amountMinor: -withVat(doc.amountIncludesVat, line.amountMinor, line.vatAmountMinor),
        reflectedInAccounting: false,
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}

export function claimServiceSource(
    doc: CustomerClaimErp,
    line: CustomerClaimServiceLineErp,
): LineChangeSource {
    return {
        kind: 'return',
        productErpId: '',
        quantity: 0,
        amountMinor: -withVat(doc.amountIncludesVat, line.amountMinor, line.vatAmountMinor),
        reflectedInAccounting: false,
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}
