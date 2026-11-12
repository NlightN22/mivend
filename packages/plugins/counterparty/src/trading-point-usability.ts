import { isUsableLocation } from './trading-point-location';

export type TradingPointDefect = 'NO_ADDRESS' | 'NO_LOCATION' | 'INACTIVE';

// Single definition of what keeps a point from customer use; the shop queries filter on the same address rule.
export function tradingPointDefects(point: {
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
}): TradingPointDefect[] {
    const defects: TradingPointDefect[] = [];
    if (!point.address?.trim()) defects.push('NO_ADDRESS');
    if (!isUsableLocation(point.latitude, point.longitude)) defects.push('NO_LOCATION');
    if (!point.isActive) defects.push('INACTIVE');
    return defects;
}

// Missing coordinates only keep a point off the map; no shop flow needs them.
export function tradingPointCustomerUsable(point: Parameters<typeof tradingPointDefects>[0]): boolean {
    return tradingPointDefects(point).every(d => d === 'NO_LOCATION');
}
