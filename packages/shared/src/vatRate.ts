// The ERP-integration placeholder rate (value 0) is named with this marker: "VAT code known, percent not confirmed".
const UNCONFIRMED_RATE_MARKER = '(auto,';

export function unconfirmedTaxRateName(rawCode: string, zoneName: string): string {
    return `${rawCode} ${UNCONFIRMED_RATE_MARKER} ${zoneName})`;
}

export function isUnconfirmedTaxRateName(name: string): boolean {
    return name.includes(UNCONFIRMED_RATE_MARKER);
}
