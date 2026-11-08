import type { OrderDetailLine } from '../api/orderDetail';

// Discount only: a line priced above its reference price subtracts nothing negative.
export function totalDiscountMinor(lines: OrderDetailLine[]): number {
    return lines.reduce(
        (sum, line) =>
            sum +
            Math.max(0, line.unitPriceWithTax - line.discountedUnitPriceWithTax) * line.quantity,
        0,
    );
}
