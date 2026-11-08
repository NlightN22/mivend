import { describe, expect, it } from 'vitest';

import { derivedKeyWarning } from '../../secret-key';

const KEY = 'a'.repeat(64);

describe('derivedKeyWarning', () => {
    it('warns in production when required and no dedicated key is set', () => {
        expect(derivedKeyWarning({ NODE_ENV: 'production' }, true)).toContain('COOKIE_SECRET');
    });

    it.each([
        [
            'a dedicated key is set',
            { NODE_ENV: 'production', TWO_FACTOR_ENCRYPTION_KEY: KEY },
            true,
        ],
        ['the second step is not required', { NODE_ENV: 'production' }, false],
        ['it is not production', { NODE_ENV: 'development' }, true],
        ['NODE_ENV is unset', {}, true],
    ])('stays silent when %s', (_name, env, required) => {
        expect(derivedKeyWarning(env, required)).toBeNull();
    });
});
