import { formatDate } from '../i18n/format';
import { tr } from './lazyLabels';
// The form's "until" is inclusive, the API's validTo is an exclusive instant: day after, local midnight.
export function periodStartIso(day: string): string | null {
    return day ? new Date(`${day}T00:00:00`).toISOString() : null;
}

export function periodEndIso(day: string): string | null {
    if (!day) return null;
    const end = new Date(`${day}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return end.toISOString();
}

export function describePeriod(validFrom: string | null, validTo: string | null): string {
    if (!validFrom && !validTo) return tr('settingsAccess.grants.permanent');
    const fmt = (v: string): string => formatDate(v);
    return tr('settingsAccess.grants.period', {
        from: validFrom ? fmt(validFrom) : tr('settingsAccess.grants.anyTime'),
        to: validTo ? fmt(validTo) : tr('settingsAccess.grants.openEnd'),
    });
}
