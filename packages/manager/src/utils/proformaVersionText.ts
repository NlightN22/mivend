import type { VersionChange } from './proformaVersionDiff';

export function signedMoney(delta: number, money: (minor: number) => string): string {
    if (delta === 0) return 'Amount unchanged';
    return `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`;
}

function count(n: number, word: string): string {
    return `${n} ${word}`;
}

export function changeSummary(change: VersionChange): string {
    return [
        change.added ? count(change.added, 'added') : '',
        change.removed ? count(change.removed, 'removed') : '',
        change.changed ? count(change.changed, 'changed') : '',
    ]
        .filter(Boolean)
        .join(', ');
}
