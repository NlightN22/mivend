import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { HibpPasswordChecker } from '../../breach/hibp-checker';

const sha1 = (value: string): string =>
    createHash('sha1').update(value).digest('hex').toUpperCase();

function checker(respond: () => Promise<Response>) {
    const fetchImpl = vi.fn(respond);
    return { fetchImpl, checker: new HibpPasswordChecker('https://hibp.test', 1000, fetchImpl) };
}

describe('HibpPasswordChecker', () => {
    it('sends only the 5-character prefix and reports a hit', async () => {
        const hash = sha1('password1');
        const { fetchImpl, checker: c } = checker(
            async () =>
                new Response(`0000000000000000000000000000000000A:2\r\n${hash.slice(5)}:9001\r\n`),
        );
        expect(await c.check('password1')).toBe('breached');
        const [url] = fetchImpl.mock.calls[0] as unknown as [string];
        expect(url).toBe(`https://hibp.test/range/${hash.slice(0, 5)}`);
        expect(url).not.toContain(hash.slice(5));
    });

    it('treats a zero-count padding entry as not breached', async () => {
        const hash = sha1('padded');
        const { checker: c } = checker(async () => new Response(`${hash.slice(5)}:0\r\n`));
        expect(await c.check('padded')).toBe('clean');
    });

    it('is clean when the suffix is absent', async () => {
        const { checker: c } = checker(async () => new Response('ABCDEF:3\r\n'));
        expect(await c.check('unique-passphrase')).toBe('clean');
    });

    it('is unavailable on a transport error or a bad status', async () => {
        expect(
            await checker(async () => Promise.reject(new Error('down'))).checker.check('x'),
        ).toBe('unavailable');
        expect(
            await checker(async () => new Response('', { status: 503 })).checker.check('x'),
        ).toBe('unavailable');
    });
});
