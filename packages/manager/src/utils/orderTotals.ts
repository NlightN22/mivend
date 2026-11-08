import type { OrderDetailLine } from '../api/orderDetail';
import { linePercent } from './orderLineRows';

// Discounts only: the reference price is the effective price grossed up by the column's percent, so a surcharge counts 0.
export function totalDiscountMinor(
    lines: OrderDetailLine[],
    serverFor: (line: OrderDetailLine) => { percent: number | null } | null = () => null,
): number {
    return lines.reduce((sum, line) => {
        const percent = linePercent(line, serverFor(line));
        if (percent === null || percent >= 100) return sum;
        const unit = line.discountedUnitPriceWithTax;
        return sum + Math.round((unit * percent) / (100 - percent)) * line.quantity;
    }, 0);
}
