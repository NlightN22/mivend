import { AGREEMENT_RU } from './agreement.ru';
import { MARKETING_CONSENT_RU } from './marketing-consent.ru';
import { PERSONAL_DATA_CONSENT_RU } from './personal-data-consent.ru';
import { POLICY_RU } from './policy.ru';
import type { LegalKind } from '../legal-kinds';

export interface LegalTemplate {
    kind: LegalKind;
    locale: string;
    version: number;
    requiresReacceptance: boolean;
    title: string;
    body: string;
}

export const LEGAL_TEMPLATES: readonly LegalTemplate[] = [
    ['policy', 'Политика обработки персональных данных', POLICY_RU],
    ['agreement', 'Пользовательское соглашение', AGREEMENT_RU],
    [
        'personal-data-consent',
        'Согласие на обработку персональных данных',
        PERSONAL_DATA_CONSENT_RU,
    ],
    [
        'marketing-consent',
        'Согласие на получение информационных и рекламных рассылок',
        MARKETING_CONSENT_RU,
    ],
].map(([kind, title, body]) => ({
    kind: kind as LegalKind,
    locale: 'ru',
    version: 1,
    requiresReacceptance: true,
    title,
    body,
}));
