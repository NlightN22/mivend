import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

// AES-256-GCM; the factor uuid is authenticated data, so a ciphertext cannot be moved to another row.
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), body]
        .map(part => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
}

export function decryptSecret(stored: string, key: Buffer, aad: string): string {
    const [version, iv, tag, body] = stored.split('.');
    if (version !== VERSION || !iv || !tag || !body) throw new Error('Unreadable factor secret');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}
