import { i18n } from '../i18n';
import type { VersionChange } from './proformaVersionDiff';

export function signedMoney(delta: number, money: (minor: number) => string): string {
    if (delta === 0) return i18n.global.t('proformaInvoices.versions.unchanged');
    return `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`;
}

const count = (n: number, key: string): string =>
    i18n.global.t(`proformaInvoices.versions.${key}`, { count: n });

export function changeSummary(change: VersionChange): string {
    return [
        change.added ? count(change.added, 'added') : '',
        change.removed ? count(change.removed, 'removed') : '',
        change.changed ? count(change.changed, 'changed') : '',
    ]
        .filter(Boolean)
        .join(', ');
}
