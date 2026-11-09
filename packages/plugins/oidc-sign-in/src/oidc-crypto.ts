import { createHash, randomBytes } from 'node:crypto';

export const randomToken = (): string => randomBytes(32).toString('base64url');

export const sha256Hex = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

export const s256Challenge = (verifier: string): string =>
    createHash('sha256').update(verifier).digest('base64url');
