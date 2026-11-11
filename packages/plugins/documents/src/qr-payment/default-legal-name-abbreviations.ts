import type { LegalNameAbbreviationRule } from './legal-name-abbreviation';

// Seeded once into an empty table; afterwards staff own the list.
export const DEFAULT_LEGAL_NAME_ABBREVIATIONS: LegalNameAbbreviationRule[] = [
    { phrase: 'Общество с ограниченной ответственностью', abbreviation: 'ООО' },
    { phrase: 'Акционерное общество', abbreviation: 'АО' },
    { phrase: 'Публичное акционерное общество', abbreviation: 'ПАО' },
    { phrase: 'Закрытое акционерное общество', abbreviation: 'ЗАО' },
    { phrase: 'Индивидуальный предприниматель', abbreviation: 'ИП' },
];
