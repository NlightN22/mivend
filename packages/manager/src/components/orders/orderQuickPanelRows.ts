import type { OrderListRow } from './ordersListRows';

export interface QuickPanelRow {
    label: string;
    value: string;
}

const EMPTY = new Set(['', '—']);

// A name that merely repeats the code adds nothing, so only a real display name is shown.
function priceTypeName(code: string, names: Map<string, string>): string {
    const name = names.get(code) ?? '';
    return name.toLowerCase() === code.toLowerCase() ? '' : name;
}

// Rows with nothing to show are left out instead of rendering a dash.
export function quickPanelRows(
    row: OrderListRow,
    priceTypes: Map<string, string>,
): QuickPanelRow[] {
    const rows: QuickPanelRow[] = [
        { label: 'Customer', value: row.customer },
        { label: 'INN', value: row.inn },
        { label: 'Price type', value: priceTypeName(row.priceTypeCode, priceTypes) },
        { label: 'Manager', value: row.manager },
        { label: 'Branch', value: row.branch },
        { label: 'Total', value: row.total },
        { label: 'Placed by', value: row.placedBy },
        { label: 'Reservation', value: row.reservation },
        { label: 'Attention', value: row.attention },
    ];
    return rows.filter(r => !EMPTY.has(r.value));
}
