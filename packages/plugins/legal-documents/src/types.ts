import type { LegalRequisites } from './requisites';

export interface LegalDocumentsOptions {
    requisites: Partial<LegalRequisites>;
    // Served when a document has no text in the requested language.
    fallbackLocale: string;
}

export const LEGAL_DOCUMENTS_OPTIONS = Symbol('LEGAL_DOCUMENTS_OPTIONS');
