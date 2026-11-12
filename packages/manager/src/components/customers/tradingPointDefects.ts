import { i18n } from '../../i18n';

export function tradingPointDefectLabel(code: string): string {
    const key = `customers.tradingPoints.defects.${code}`;
    return i18n.global.te(key) ? i18n.global.t(key) : code;
}

export function visibleTradingPointDefects(codes: readonly string[]): string[] {
    return codes.filter(code => code !== 'INACTIVE');
}
