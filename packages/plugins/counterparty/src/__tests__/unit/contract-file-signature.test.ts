import { describe, expect, it } from 'vitest';

import { detectMime } from '../../contract-file/contract-file-signature';

describe('detectMime', () => {
    it.each([
        ['application/pdf', Buffer.from('%PDF-1.7 body')],
        ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])],
        ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])],
    ])('recognises %s by its first bytes', (mime, data) => {
        expect(detectMime(data)).toBe(mime);
    });

    it.each([
        ['html', Buffer.from('<html><script>alert(1)</script>')],
        ['a PDF-looking prefix without the dash', Buffer.from('%PDF body')],
        ['empty', Buffer.alloc(0)],
        ['a truncated PNG header', Buffer.from([0x89, 0x50, 0x4e])],
    ])('rejects %s', (_name, data) => {
        expect(detectMime(data)).toBeNull();
    });
});
