export interface HeaderDeliveryLabel {
    organization: string;
    place: string;
}

interface TradingPointLike {
    name?: string | null;
    address?: string | null;
}

// Counterparty full name, then the trading point name; the address only when the point has no name.
export function headerDeliveryLabel(
    counterpartyFullName: string | null | undefined,
    tradingPoint: TradingPointLike | null | undefined,
): HeaderDeliveryLabel {
    return {
        organization: counterpartyFullName?.trim() ?? '',
        place: tradingPoint?.name?.trim() || tradingPoint?.address?.trim() || '',
    };
}
