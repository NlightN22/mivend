import { formatMoney } from '../i18n/format';

export function documentMoney(currencyCode: string): (minor: number) => string {
    return minor => formatMoney(minor, currencyCode);
}
