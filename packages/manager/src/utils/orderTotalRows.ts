import { tr } from './lazyLabels';
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
    return count ? tr('orderLines.totals.positionsWithoutData', { n: count }, count) : undefined;
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
        {
            key: 'positions',
            label: tr('orderLines.totals.positions'),
            value: String(order.lines.length),
        },
        {
            key: 'weight',
            label: tr('orderLines.totals.weightTotal'),
            value: formatWeightKg(packaging.totalWeightKg),
            note: withoutData(gaps.weight),
        },
        {
            key: 'volume',
            label: tr('orderLines.totals.volumeTotal'),
            value: formatVolumeM3(packaging.totalVolumeM3),
            note: withoutData(gaps.volume),
        },
        {
            key: 'subtotal',
            label: tr('orderLines.totals.subtotal'),
            value: money(order.subTotalWithTax),
        },
        { key: 'discount', label: tr('orderLines.totals.discountTotal'), value: money(discount) },
    ];
    if (retroTotal !== null)
        rows.push({
            key: 'retro',
            label: tr('orderLines.totals.retroTotal'),
            value: money(retroTotal),
        });
    rows.push({
        key: 'delivery',
        label: tr('orderLines.totals.delivery'),
        value: money(order.shippingWithTax),
    });
    if (paid != null)
        rows.push({
            key: 'paid',
            label: tr('orderLines.totals.paid'),
            value: money(paid),
            note: tr('orderLines.totals.atLeast'),
        });
    rows.push({
        key: 'total',
        label: tr('orderLines.totals.total'),
        value: money(order.totalWithTax),
        emphasis: true,
    });
    return rows;
}
