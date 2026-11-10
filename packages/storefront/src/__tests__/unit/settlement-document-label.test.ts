import { describe, expect, it } from 'vitest';
import en from '../../i18n/en';
import { ERP_DOCUMENT_TYPE_STYLES } from '../../../../ui-kit/src/components/MvDocumentTypeChip/erpDocumentTypeStyles';
import ru from '../../i18n/ru';
import { i18n } from '../../i18n';
import { documentTypeLabel } from '../../pages/settlements/useSettlementDocuments';

const knownType = Object.keys(ERP_DOCUMENT_TYPE_STYLES)[0];
const knownLabel =
    en.settlements.documentType[
        ERP_DOCUMENT_TYPE_STYLES[knownType].labelKey as keyof typeof en.settlements.documentType
    ];

describe('documentTypeLabel', () => {
    it('does not trust the ERP label for a known type', () => {
        i18n.global.setLocaleMessage('en', en);
        expect(documentTypeLabel(knownType, 'wrong synonym')).toBe(knownLabel);
    });

    it('uses the ERP label for a type without a translation', () => {
        expect(documentTypeLabel('FutureDocument', 'Future document')).toBe('Future document');
    });

    it('has the same document types in every catalogue', () => {
        expect(Object.keys(ru.settlements.documentType)).toEqual(
            Object.keys(en.settlements.documentType),
        );
    });
});

describe('document type label keys', () => {
    it('has a catalogue entry for every ERP document type', () => {
        const keys = Object.values(ERP_DOCUMENT_TYPE_STYLES).map(style => style.labelKey);
        expect(keys.sort()).toEqual(Object.keys(en.settlements.documentType).sort());
    });
});
