import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import cookieSession from 'cookie-session';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deviceCookieMiddleware } from '../../device-identity';

// Real express + cookie-session, registered in the order Vendure uses (session first, ours after).
let server: Server;
let base = '';

function build(secure: boolean): Promise<void> {
    const app = express();
    app.use(cookieSession({ name: 'session', keys: ['k'] }));
    app.use(deviceCookieMiddleware(secure));
    app.get('/login', (req, res) => {
        (req.session as Record<string, unknown>).token = 'abc';
        res.json({ ok: true });
    });
    app.get('/plain', (_req, res) => res.json({ ok: true }));
    app.get('/logout', (req, res) => {
        req.session = null;
        res.json({ ok: true });
    });
    return new Promise(resolve => {
        server = app.listen(0, () => {
            base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
            resolve();
        });
    });
}

async function cookiesOf(path: string, headers: Record<string, string> = {}): Promise<string[]> {
    return (await fetch(base + path, { headers })).headers.getSetCookie();
}

const named = (cookies: string[], name: string): string[] =>
    cookies.filter(c => c.startsWith(`${name}=`));

describe('deviceCookieMiddleware with a real express and cookie-session pipeline', () => {
    beforeAll(() => build(true));
    afterAll(() => new Promise(resolve => server.close(resolve)));

    it('sends the session cookie, its signature and exactly one device cookie on sign-in', async () => {
        const cookies = await cookiesOf('/login');
        expect(named(cookies, 'session')).toHaveLength(1);
        expect(named(cookies, 'session.sig')).toHaveLength(1);
        const device = named(cookies, 'mv_device');
        expect(device).toHaveLength(1);
        expect(device[0]).toMatch(/^mv_device=[0-9a-f]{32}; .*HttpOnly.*SameSite=Lax/i);
        expect(device[0]).toMatch(/secure/i);
    });

    it('sends no device cookie when no session cookie is written', async () => {
        expect(await cookiesOf('/plain')).toEqual([]);
    });

    it('sends no device cookie when the session is cleared', async () => {
        expect(named(await cookiesOf('/logout', { cookie: 'session=x' }), 'mv_device')).toEqual([]);
    });

    it('does not reissue when the device cookie is present', async () => {
        const cookies = await cookiesOf('/login', { cookie: 'mv_device=abc' });
        expect(named(cookies, 'session')).toHaveLength(1);
        expect(named(cookies, 'mv_device')).toEqual([]);
    });

    it('leaves acting traffic untouched', async () => {
        const cookies = await cookiesOf('/login', { 'x-acting-session': '1' });
        expect(named(cookies, 'mv_device')).toEqual([]);
    });
});

describe('without the Secure configuration', () => {
    beforeAll(() => build(false));
    afterAll(() => new Promise(resolve => server.close(resolve)));

    it('omits Secure on plain http', async () => {
        const device = named(await cookiesOf('/login'), 'mv_device');
        expect(device).toHaveLength(1);
        expect(device[0]).not.toMatch(/secure/i);
    });
});
