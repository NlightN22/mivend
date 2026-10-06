import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
    downloadVerifiedPhoto,
    MAX_PHOTO_BYTES,
    PermanentPhotoError,
    photoFileName,
} from '../../product-photo-download';

const body = Buffer.from('image-bytes');
const hash = createHash('md5').update(body).digest('hex');

const respond = (status: number, content: Buffer = body): typeof fetch =>
    (async () => new Response(content, { status })) as typeof fetch;

describe('downloadVerifiedPhoto', () => {
    it('returns the body when the md5 matches', async () => {
        expect(await downloadVerifiedPhoto('u', hash, respond(200))).toEqual(body);
    });

    it('treats a hash mismatch as permanent', async () => {
        await expect(downloadVerifiedPhoto('u', 'deadbeef', respond(200))).rejects.toBeInstanceOf(
            PermanentPhotoError,
        );
    });

    it('treats an expired/refused link (403) as permanent', async () => {
        await expect(downloadVerifiedPhoto('u', hash, respond(403))).rejects.toBeInstanceOf(
            PermanentPhotoError,
        );
    });

    it('treats a server error as transient', async () => {
        const error = await downloadVerifiedPhoto('u', hash, respond(503)).catch(e => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PermanentPhotoError);
    });
});

describe('downloadVerifiedPhoto limits', () => {
    it('aborts a body larger than the cap even without content-length', async () => {
        const big = Buffer.alloc(MAX_PHOTO_BYTES + 1);
        await expect(downloadVerifiedPhoto('u', 'x', respond(200, big))).rejects.toBeInstanceOf(
            PermanentPhotoError,
        );
    });

    it('passes an abort signal so a hung connection cannot hold the job', async () => {
        let signal: AbortSignal | undefined;
        const spy = (async (_u: unknown, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Response(body);
        }) as typeof fetch;
        await downloadVerifiedPhoto('u', hash, spy);
        expect(signal).toBeInstanceOf(AbortSignal);
    });
});

describe('photoFileName', () => {
    it('keys the name by hash and mime type', () => {
        expect(photoFileName('abc', 'image/webp')).toBe('abc.webp');
    });

    it('rejects a non-web mime type', () => {
        expect(() => photoFileName('abc', 'image/bmp')).toThrow(PermanentPhotoError);
    });
});
