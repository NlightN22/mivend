export const FREIGHT_SHIPPING_METHOD_CODE = 'freight-delivery';
export const PICKUP_SHIPPING_METHOD_CODE = 'pickup';

// One predicate for "ships by courier": a staff delivery edit sets the same method on every line.
export const hasFreightShippingLine = (
    lines: ReadonlyArray<{ shippingMethod?: { code?: string } | null }>,
): boolean => lines.some(l => l.shippingMethod?.code === FREIGHT_SHIPPING_METHOD_CODE);
