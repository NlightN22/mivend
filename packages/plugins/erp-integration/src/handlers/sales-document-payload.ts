import type {
    ErpHeaderFields,
    ErpLineRow,
    ErpRef,
    ErpSalesDocument,
    ErpSalesDocumentLine,
} from '@mivend/plugin-erp-order';

import { bool, flt, int, money, ref, str, time } from './erp-document-payload';
import type { Payload } from './erp-document-payload';

// Envelope keys and the columns below are not repeated in attributes.
const HEADER_COLUMNS = new Set([
    'eventId',
    'occurredAt',
    'entityId',
    'version',
    'updatedAt',
    'number',
    'date',
    'isPosted',
    'isDeletionMarked',
    'isDeleted',
    'counterpartyId',
    'contractId',
    'organizationId',
    'dealId',
    'dealType',
    'basisDocumentId',
    'warehouseOrderId',
    'customerOrderId',
    'currencyId',
    'totalAmount',
    'amountIncludesVat',
    'truncated',
    'tableRowCounts',
]);
const ROW_COLUMNS = new Set([
    'lineNumber',
    'customerOrderId',
    'dealId',
    'productId',
    'quantity',
    'coefficient',
    'amount',
    'vatAmount',
]);

const isRows = (value: unknown): value is Payload[] =>
    Array.isArray(value) && value.length > 0 && value.every(item => ref(item) !== null);

// A table part is any array of messages; its name is the payload key, so no table list is kept in code.
function tableParts(p: Payload): [string, Payload[]][] {
    return Object.entries(p).filter((entry): entry is [string, Payload[]] => isRows(entry[1]));
}

function rest(source: Payload, skip: ReadonlySet<string>, skipArrays: boolean): ErpRef {
    return Object.fromEntries(
        Object.entries(source).filter(
            ([key, value]) => !skip.has(key) && !(skipArrays && Array.isArray(value)),
        ),
    );
}

export function salesDocumentFields(
    kind: string,
    p: Payload,
    currency: string | null,
): ErpHeaderFields<ErpSalesDocument> {
    const counts = ref(p.tableRowCounts);
    return {
        kind,
        number: str(p.number) ?? '',
        date: time(p.date),
        posted: p.isPosted === true,
        deletionMarked: p.isDeletionMarked === true,
        counterpartyId: str(p.counterpartyId),
        contractId: str(p.contractId),
        organizationId: str(p.organizationId),
        dealId: str(p.dealId),
        dealType: str(p.dealType),
        basisDocumentId: str(p.basisDocumentId) ?? str(p.warehouseOrderId),
        customerOrderId: str(p.customerOrderId),
        currency,
        totalAmountMinor: money(p.totalAmount),
        amountIncludesVat: bool(p.amountIncludesVat),
        truncated: p.truncated === true,
        rowCounts: counts,
        attributes: rest(p, HEADER_COLUMNS, true),
    };
}

export function salesDocumentLines(p: Payload): ErpLineRow<ErpSalesDocumentLine>[] {
    return tableParts(p).flatMap(([part, rows]) =>
        rows.map((row, index) => ({
            part,
            lineNumber: int(row.lineNumber) ?? index + 1,
            linkedId: str(row.customerOrderId) ?? str(row.dealId),
            productId: str(row.productId),
            quantity: flt(row.quantity),
            coefficient: flt(row.coefficient),
            amountMinor: money(row.amount),
            vatAmountMinor: money(row.vatAmount),
            attributes: rest(row, ROW_COLUMNS, false),
        })),
    );
}
