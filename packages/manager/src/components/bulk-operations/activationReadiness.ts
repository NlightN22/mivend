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

export const READINESS_LABEL: Record<Readiness, string> = {
    ready: 'Ready to activate',
    'missing-data': 'Missing data',
    'inn-duplicate': 'Duplicate INN',
    'erp-inactive': 'ERP inactive',
    activated: 'Activated',
};

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
    if (!/\d/.test(c.inn ?? '')) missing.push('INN');
    return missing;
}

export function readinessText(
    readiness: Readiness,
    c: Pick<ActivationCandidate, 'phone' | 'officialEmail' | 'inn'>,
): string {
    if (readiness !== 'missing-data') return READINESS_LABEL[readiness];
    const fields = missingFields(c);
    const last = fields[fields.length - 1];
    const list = fields.length > 1 ? `${fields.slice(0, -1).join(', ')} and ${last}` : last;
    return `Missing ${list} (ERP)`;
}
