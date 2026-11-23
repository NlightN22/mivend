import type { ErpSalesDocument } from '../erp-documents/erp-sales-document.entity';
import type { ErpSalesDocumentLine } from '../erp-documents/erp-sales-document-line.entity';
import type { LineChangeKind, LineChangeSource } from './line-change.types';

// Stream names of the ERP documents that feed the order card; the rest of the sales documents feed nothing.
export const SALES_DOCUMENT_KIND_BY_STREAM: Readonly<Record<string, LineChangeKind>> = {
    'goods-and-services-sale': 'realization',
    'customer-goods-return': 'return',
    'warehouse-order': 'picking',
    'tl-warehouse-work-result': 'picked',
};

// Table part that carries the product rows of each stream (the payload key of the repeated field).
export const SOURCE_PART_BY_STREAM: Readonly<Record<string, string>> = {
    'goods-and-services-sale': 'goods',
    'customer-goods-return': 'goods',
    'warehouse-order': 'goods',
    'tl-warehouse-work-result': 'warehouseWork',
};

// Customer rule: posted and neither marked for deletion nor deleted; the ERP's reflect_in_* flags are not that signal.
export const isReflectedSalesDocument = (doc: ErpSalesDocument): boolean =>
    doc.posted && !doc.deletionMarked && !doc.isDeleted;

// Same VAT convention as corrections: Order.totalWithTax includes VAT.
function lineMoney(doc: ErpSalesDocument, line: ErpSalesDocumentLine): number {
    const amount = line.amountMinor ?? 0;
    return doc.amountIncludesVat === false ? amount + (line.vatAmountMinor ?? 0) : amount;
}

// Returns reduce the sold quantity and money; the other kinds are informational and carry no money.
export function salesDocumentSource(
    doc: ErpSalesDocument,
    line: ErpSalesDocumentLine,
): LineChangeSource | null {
    const kind = SALES_DOCUMENT_KIND_BY_STREAM[doc.kind];
    if (!kind || !line.productId || line.quantity === null) return null;
    const base = line.quantity * (line.coefficient || 1);
    return {
        kind,
        productErpId: line.productId,
        quantity: kind === 'return' ? -base : base,
        amountMinor: kind === 'return' ? -lineMoney(doc, line) : 0,
        reflectedInAccounting: isReflectedSalesDocument(doc),
        documentNumber: doc.number,
        documentDate: doc.date,
    };
}
