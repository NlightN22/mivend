import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { activationReadiness, type ActivationCandidate } from '../../api/counterpartyPortalAccess';

export type Readiness = ReturnType<typeof activationReadiness>;

export const READINESS_VALUES: Readiness[] = ['ready', 'missing-data', 'erp-inactive', 'activated'];

export const READINESS_LABEL: Record<Readiness, string> = {
    ready: 'Ready to activate',
    'missing-data': 'Missing data',
    'erp-inactive': 'ERP inactive',
    activated: 'Activated',
};

export const READINESS_BADGE_VARIANT: Record<Readiness, StatusBadgeVariant> = {
    ready: 'success',
    'missing-data': 'warning',
    'erp-inactive': 'danger',
    activated: 'neutral',
};

// Phone and official email come from the ERP and cannot be edited in the portal.
export function missingFields(c: Pick<ActivationCandidate, 'phone' | 'officialEmail'>): string[] {
    const missing: string[] = [];
    if (!c.phone) missing.push('phone');
    if (!c.officialEmail) missing.push('email');
    return missing;
}

export function readinessText(
    readiness: Readiness,
    c: Pick<ActivationCandidate, 'phone' | 'officialEmail'>,
): string {
    if (readiness !== 'missing-data') return READINESS_LABEL[readiness];
    return `Missing ${missingFields(c).join(' and ')} (ERP)`;
}
