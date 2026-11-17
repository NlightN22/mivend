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
        amountMinor: line.amountMinor - (line.amountBeforeCorrectionMinor ?? line.amountMinor),
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
        amountMinor: line.amountMinor - (line.amountBeforeCorrectionMinor ?? line.amountMinor),
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
        amountMinor: -line.amountMinor,
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
        amountMinor: -line.amountMinor,
        reflectedInAccounting: false,
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}
