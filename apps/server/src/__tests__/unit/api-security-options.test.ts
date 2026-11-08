import { describe, expect, it } from 'vitest';

import { apiSecurityOptionsFromEnv } from '../../api-security-options';

describe('apiSecurityOptionsFromEnv', () => {
    it.each([undefined, '', '  , ,'])('sends no CORS headers when the list is "%s"', value => {
        const options = apiSecurityOptionsFromEnv({ CORS_ALLOWED_ORIGINS: value });
        expect(options.cors).toBe(false);
    });

    it('allows credentials for exactly the listed origins', () => {
        const options = apiSecurityOptionsFromEnv({
            NODE_ENV: 'production',
            CORS_ALLOWED_ORIGINS: ' https://shop.example.test, https://manager.example.test ',
        });
        expect(options.cors).toEqual({
            origin: ['https://shop.example.test', 'https://manager.example.test'],
            credentials: true,
        });
    });

    it('refuses a wildcard origin', () => {
        expect(() => apiSecurityOptionsFromEnv({ CORS_ALLOWED_ORIGINS: '*' })).toThrow(
            /explicit origins/,
        );
    });

    it('always enables csrfPrevention', () => {
        expect(apiSecurityOptionsFromEnv({}).csrfPrevention).toBe(true);
        expect(
            apiSecurityOptionsFromEnv({ CORS_ALLOWED_ORIGINS: 'https://a.example.test' })
                .csrfPrevention,
        ).toBe(true);
    });
});
