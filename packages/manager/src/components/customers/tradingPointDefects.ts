const LABELS: Record<string, string> = {
    NO_ADDRESS: 'No address',
    NO_LOCATION: 'No coordinates',
    INACTIVE: 'Inactive',
};

export function tradingPointDefectLabel(code: string): string {
    return LABELS[code] ?? code;
}

export function visibleTradingPointDefects(codes: readonly string[]): string[] {
    return codes.filter(code => code !== 'INACTIVE');
}
