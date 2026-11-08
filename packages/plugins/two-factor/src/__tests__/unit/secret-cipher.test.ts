import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '../../secret-cipher';
import { resolveEncryptionKey } from '../../secret-key';
import { hashToken, newToken } from '../../token-hash';

const KEY = randomBytes(32);

describe('secret cipher', () => {
    it('round-trips a secret and never stores it in the clear', () => {
        const stored = encryptSecret('JBSWY3DPEHPK3PXP', KEY, 'uuid-1');
        expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
        expect(decryptSecret(stored, KEY, 'uuid-1')).toBe('JBSWY3DPEHPK3PXP');
    });

    it('uses a fresh nonce each time', () => {
        expect(encryptSecret('AAAA', KEY, 'u')).not.toBe(encryptSecret('AAAA', KEY, 'u'));
    });

    it('refuses a ciphertext moved to another row, another key or a tampered body', () => {
        const stored = encryptSecret('JBSWY3DPEHPK3PXP', KEY, 'uuid-1');
        expect(() => decryptSecret(stored, KEY, 'uuid-2')).toThrow();
        expect(() => decryptSecret(stored, randomBytes(32), 'uuid-1')).toThrow();
        const [version, iv, tag, body] = stored.split('.');
        const flipped = `${body.slice(0, -2)}${body.endsWith('AA') ? 'BB' : 'AA'}`;
        expect(() => decryptSecret([version, iv, tag, flipped].join('.'), KEY, 'uuid-1')).toThrow();
        expect(() => decryptSecret('garbage', KEY, 'uuid-1')).toThrow();
    });
});

describe('resolveEncryptionKey', () => {
    it('derives a stable 32-byte key from the cookie secret', () => {
        const key = resolveEncryptionKey({}, 'cookie-secret');
        expect(key).toHaveLength(32);
        expect(resolveEncryptionKey({}, 'cookie-secret')).toEqual(key);
        expect(resolveEncryptionKey({}, 'another-secret')).not.toEqual(key);
    });

    it('prefers the dedicated key and ignores the cookie secret then', () => {
        const hex = randomBytes(32).toString('hex');
        const env = { TWO_FACTOR_ENCRYPTION_KEY: hex };
        expect(resolveEncryptionKey(env, 'a')).toEqual(Buffer.from(hex, 'hex'));
        expect(resolveEncryptionKey(env, 'b')).toEqual(Buffer.from(hex, 'hex'));
    });

    it.each(['short', 'zz'.repeat(32), 'ab'.repeat(31)])('refuses the dedicated key %j', value => {
        expect(() => resolveEncryptionKey({ TWO_FACTOR_ENCRYPTION_KEY: value }, 'a')).toThrow(
            /TWO_FACTOR_ENCRYPTION_KEY/,
        );
    });

    it('treats an empty dedicated key as unset', () => {
        expect(resolveEncryptionKey({ TWO_FACTOR_ENCRYPTION_KEY: '' }, 'a')).toHaveLength(32);
    });
});

describe('token hashing', () => {
    it('hashes deterministically and keeps the token out of the hash', () => {
        const token = newToken();
        expect(token.length).toBeGreaterThanOrEqual(43);
        expect(hashToken(token)).toBe(hashToken(token));
        expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashToken(token)).not.toContain(token);
        expect(newToken()).not.toBe(token);
    });
});
