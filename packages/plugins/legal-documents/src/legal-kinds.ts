export type LegalKind = 'policy' | 'agreement' | 'personal-data-consent' | 'marketing-consent';

export interface LegalKindRule {
    // Appears in the acceptance flow; the policy is only published.
    acceptable: boolean;
    // A missing acceptance blocks sign-in; an optional kind is asked once and never blocks.
    required: boolean;
}

export const LEGAL_KIND_RULES: Readonly<Record<LegalKind, LegalKindRule>> = {
    policy: { acceptable: false, required: false },
    agreement: { acceptable: true, required: true },
    'personal-data-consent': { acceptable: true, required: true },
    'marketing-consent': { acceptable: true, required: false },
};

export const LEGAL_KINDS = Object.keys(LEGAL_KIND_RULES) as LegalKind[];

export function isLegalKind(value: string): value is LegalKind {
    return value in LEGAL_KIND_RULES;
}
