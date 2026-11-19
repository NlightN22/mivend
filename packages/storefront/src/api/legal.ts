import { shopApi } from './client';
import {
    AcceptLegalDocumentsDocument,
    LegalDocumentDocument,
    LegalDocumentStatusDocument,
    type LegalDocumentQuery,
    type LegalDocumentStatusQuery,
} from './generated/graphql';

export type LegalDocument = NonNullable<LegalDocumentQuery['legalDocument']>;
export type LegalStatus = LegalDocumentStatusQuery['legalDocumentStatus'][number];

export async function fetchLegalDocument(
    kind: string,
    locale: string,
): Promise<LegalDocument | null> {
    const { legalDocument } = await shopApi(LegalDocumentDocument, { kind, locale });
    return legalDocument ?? null;
}

export async function fetchLegalStatus(): Promise<LegalStatus[]> {
    const { legalDocumentStatus } = await shopApi(LegalDocumentStatusDocument);
    return legalDocumentStatus;
}

export async function acceptLegal(
    input: { kind: string; version: number; accepted: boolean }[],
    locale: string,
): Promise<LegalStatus[]> {
    const { acceptLegalDocuments } = await shopApi(AcceptLegalDocumentsDocument, { input, locale });
    return acceptLegalDocuments;
}
