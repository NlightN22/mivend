import { describe, expect, it } from 'vitest';

import { legalDocumentsOptionsFromEnv } from '../../legal-documents-options';

describe('legalDocumentsOptionsFromEnv', () => {
    it('takes the platform name and address from the storefront URL and defaults the rest', () => {
        const options = legalDocumentsOptionsFromEnv({
            STOREFRONT_PUBLIC_URL: 'https://shop.example.com',
            LEGAL_OPERATOR_NAME: 'Operator',
            LEGAL_CONTACT_EMAIL: 'a@example.com',
        });
        expect(options.requisites).toMatchObject({
            platformName: 'shop.example.com',
            portalUrl: 'https://shop.example.com',
            operatorName: 'Operator',
            operatorStatus: 'Физическое лицо',
            jurisdiction: 'Российской Федерации',
        });
        expect(options.fallbackLocale).toBe('ru');
    });

    it('lets the environment override status and jurisdiction', () => {
        const { requisites } = legalDocumentsOptionsFromEnv({
            LEGAL_OPERATOR_STATUS: 'Status',
            LEGAL_JURISDICTION: 'Country',
        });
        expect(requisites.operatorStatus).toBe('Status');
        expect(requisites.jurisdiction).toBe('Country');
    });

    it('leaves the operator, e-mail and storefront URL undefined so publishing stays blocked', () => {
        const { requisites } = legalDocumentsOptionsFromEnv({ STOREFRONT_PUBLIC_URL: 'not a url' });
        expect(requisites.contactEmail).toBeUndefined();
        expect(requisites.operatorName).toBeUndefined();
        expect(requisites.platformName).toBeUndefined();
    });
});
