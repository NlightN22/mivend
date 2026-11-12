import { i18n } from '../../i18n';
import type { StatusBadgeVariant } from '@mivend/ui-kit';
import type { ActivationCandidate } from '../../api/counterpartyPortalAccess';

export const READINESS_VALUES = [
    'ready',
    'missing-data',
    'inn-duplicate',
    'erp-inactive',
    'activated',
] as const;
export type Readiness = (typeof READINESS_VALUES)[number];

// The server decides the status; an unknown value from a newer server is shown as missing data.
export function readinessOf(c: Pick<ActivationCandidate, 'portalReadiness'>): Readiness {
    return READINESS_VALUES.find(v => v === c.portalReadiness) ?? 'missing-data';
}

export const readinessLabel = (readiness: string): string =>
    i18n.global.t('bulkOperations.activation.readiness.' + readiness);

export const READINESS_BADGE_VARIANT: Record<Readiness, StatusBadgeVariant> = {
    ready: 'success',
    'missing-data': 'warning',
    'inn-duplicate': 'warning',
    'erp-inactive': 'danger',
    activated: 'neutral',
};

// Phone, official email and INN come from the ERP and cannot be edited in the portal.
export function missingFields(
    c: Pick<ActivationCandidate, 'phone' | 'officialEmail' | 'inn'>,
): string[] {
    const missing: string[] = [];
    if (!c.phone) missing.push('phone');
    if (!c.officialEmail) missing.push('email');
    if (!/\d/.test(c.inn ?? '')) missing.push('inn');
    return missing;
}

export function readinessText(
    readiness: Readiness,
    c: Pick<ActivationCandidate, 'phone' | 'officialEmail' | 'inn'>,
): string {
    const t = (key: string, named?: Record<string, unknown>): string =>
        i18n.global.t('bulkOperations.activation.' + key, named ?? {});
    if (readiness !== 'missing-data') return readinessLabel(readiness);
    const fields = missingFields(c).map(f => t(`missing.${f}`));
    const last = fields[fields.length - 1];
    const list =
        fields.length > 1 ? `${fields.slice(0, -1).join(', ')} ${t('missing.and')} ${last}` : last;
    return t('missing.text', { list });
}
