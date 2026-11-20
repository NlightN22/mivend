import { AGREEMENT_EN } from './agreement.en';
import { AGREEMENT_RU } from './agreement.ru';
import { MARKETING_CONSENT_EN } from './marketing-consent.en';
import { MARKETING_CONSENT_RU } from './marketing-consent.ru';
import { PERSONAL_DATA_CONSENT_EN } from './personal-data-consent.en';
import { PERSONAL_DATA_CONSENT_RU } from './personal-data-consent.ru';
import { POLICY_EN } from './policy.en';
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

type Row = [LegalKind, string, string];

function templates(locale: string, rows: Row[]): LegalTemplate[] {
    return rows.map(([kind, title, body]) => ({
        kind,
        locale,
        version: 1,
        requiresReacceptance: true,
        title,
        body,
    }));
}

export const LEGAL_TEMPLATES: readonly LegalTemplate[] = [
    ...templates('ru', [
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
    ]),
    ...templates('en', [
        ['policy', 'Personal Data Processing Policy', POLICY_EN],
        ['agreement', 'User Agreement', AGREEMENT_EN],
        ['personal-data-consent', 'Consent to Personal Data Processing', PERSONAL_DATA_CONSENT_EN],
        [
            'marketing-consent',
            'Consent to Informational and Promotional Messages',
            MARKETING_CONSENT_EN,
        ],
    ]),
];
