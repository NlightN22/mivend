import type { DocTotalRow } from '@mivend/ui-kit';
import type { OrderDetail } from '../api/orderDetail';
import {
    formatVolumeM3,
    formatWeightKg,
    packagingGaps,
    useOrderPackaging,
} from '../composables/useOrderPackaging';
import { totalDiscountMinor } from './orderTotals';

function withoutData(count: number): string | undefined {
    return count ? `${count} ${count === 1 ? 'position' : 'positions'} without data` : undefined;
}

export function orderTotalRows(
    order: OrderDetail,
    retroTotal: number | null,
    money: (minor: number) => string,
    serverFor?: (line: OrderDetail['lines'][number]) => { percent: number | null } | null,
): DocTotalRow[] {
    const packaging = useOrderPackaging(order.lines);
    const gaps = packagingGaps(order.lines);
    const discount = totalDiscountMinor(order.lines, serverFor);
    const paid = order.customFields.erpPaidAmount;
    const rows: DocTotalRow[] = [
        { key: 'positions', label: 'Positions', value: String(order.lines.length) },
        {
            key: 'weight',
            label: 'Weight total',
            value: formatWeightKg(packaging.totalWeightKg),
            note: withoutData(gaps.weight),
        },
        {
            key: 'volume',
            label: 'Volume total',
            value: formatVolumeM3(packaging.totalVolumeM3),
            note: withoutData(gaps.volume),
        },
        { key: 'subtotal', label: 'Subtotal', value: money(order.subTotalWithTax) },
        { key: 'discount', label: 'Discount total', value: money(discount) },
    ];
    if (retroTotal !== null)
        rows.push({ key: 'retro', label: 'Retro bonus total', value: money(retroTotal) });
    rows.push({ key: 'delivery', label: 'Delivery', value: money(order.shippingWithTax) });
    if (paid != null)
        rows.push({ key: 'paid', label: 'Paid in ERP', value: money(paid), note: 'at least' });
    rows.push({ key: 'total', label: 'Total', value: money(order.totalWithTax), emphasis: true });
    return rows;
}
