import { hkdfSync } from 'node:crypto';

type Env = Record<string, string | undefined>;

const KEY_BYTES = 32;

// The single place the factor-encryption key is chosen. Without TWO_FACTOR_ENCRYPTION_KEY it is derived from
// COOKIE_SECRET, so rotating COOKIE_SECRET then makes every stored factor undecryptable.
export function resolveEncryptionKey(env: Env, cookieSecret: string): Buffer {
    const dedicated = env.TWO_FACTOR_ENCRYPTION_KEY;
    if (dedicated) {
        if (!/^[0-9a-fA-F]{64}$/.test(dedicated)) {
            throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
        }
        return Buffer.from(dedicated, 'hex');
    }
    return Buffer.from(
        hkdfSync(
            'sha256',
            cookieSecret,
            'mivend-two-factor-v1',
            'totp-secret-encryption',
            KEY_BYTES,
        ),
    );
}
