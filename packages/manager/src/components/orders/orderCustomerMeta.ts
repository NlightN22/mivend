import { tr } from '../../utils/lazyLabels';
import type { OrderListRow } from './ordersListRows';

// A name that merely repeats the code adds nothing, so only a real display name is shown.
export function priceTypeName(code: string, names: Map<string, string>): string {
    const name = names.get(code) ?? '';
    return name.toLowerCase() === code.toLowerCase() ? '' : name;
}

// Second line of the customer cell: only real data, an empty string when there is none.
export function customerMetaText(
    row: Pick<OrderListRow, 'inn' | 'priceTypeCode'>,
    priceTypes: Map<string, string>,
): string {
    const parts = [row.inn ? tr('orders.list.inn', { inn: row.inn }) : '', priceTypeName(row.priceTypeCode, priceTypes)];
    return parts.filter(Boolean).join(' · ');
}
