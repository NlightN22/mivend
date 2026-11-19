import { describe, expect, it } from 'vitest';

import { legalDocumentsOptionsFromEnv } from '../../legal-documents-options';

describe('legalDocumentsOptionsFromEnv', () => {
    it('reads every requisite and defaults the fallback language', () => {
        const options = legalDocumentsOptionsFromEnv({
            LEGAL_PLATFORM_NAME: 'Portal',
            LEGAL_OPERATOR_NAME: 'Operator',
            LEGAL_OPERATOR_STATUS: 'Status',
            LEGAL_CONTACT_EMAIL: 'a@example.com',
            LEGAL_CONTACT_ADDRESS: 'Street',
            LEGAL_PORTAL_URL: 'https://example.com',
            LEGAL_JURISDICTION: 'Country',
        });
        expect(options.requisites.operatorName).toBe('Operator');
        expect(options.requisites.jurisdiction).toBe('Country');
        expect(options.fallbackLocale).toBe('ru');
    });

    it('leaves unset requisites undefined so publishing stays blocked', () => {
        expect(legalDocumentsOptionsFromEnv({}).requisites.contactEmail).toBeUndefined();
    });
});
