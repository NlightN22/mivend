export interface LineChangeViewEvent {
    kind: string;
    title: string;
    subtitle: string;
    quantity: number;
    remainder: number;
    reference?: string;
}

export function formatSigned(value: number): string {
    return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}
