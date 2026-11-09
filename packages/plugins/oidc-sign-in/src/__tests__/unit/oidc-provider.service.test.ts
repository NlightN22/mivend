import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { KeyLike } from 'jose';

import { OidcProviderService } from '../../oidc-provider.service';

let ISSUER = '';
let OPTIONS = {
    issuer: '',
    clientId: 'client-a',
    clientSecret: 'secret-a',
    redirectUri: 'https://manager.example.com/oidc/callback',
};
let privateKey: KeyLike;
let jwk: object;
let mintToken: () => Promise<string> = async () => '';
let discoveryIssuer: string | null = null;
let tokenRequest: { body: string; authorization: string | undefined } | null = null;

const server = createServer((req, res) => {
    const send = (body: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };
    if (req.url?.endsWith('/openid-configuration')) {
        return send({
            issuer: discoveryIssuer ?? ISSUER,
            authorization_endpoint: `${ISSUER}/auth`,
            token_endpoint: `${ISSUER}/token`,
            jwks_uri: `${ISSUER}/certs`,
        });
    }
    if (req.url?.endsWith('/certs')) return send({ keys: [jwk] });
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
        tokenRequest = { body, authorization: req.headers.authorization };
        send({ id_token: await mintToken() });
    });
});

beforeAll(async () => {
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    ISSUER = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    OPTIONS = { ...OPTIONS, issuer: ISSUER };
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
});
afterAll(() => new Promise<void>(done => server.close(() => done())));
afterEach(() => {
    discoveryIssuer = null;
    tokenRequest = null;
});

function token(
    claims: Record<string, unknown>,
    over: { iss?: string; aud?: string; exp?: string } = {},
) {
    return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(over.iss ?? ISSUER)
        .setAudience(over.aud ?? 'client-a')
        .setExpirationTime(over.exp ?? '5m')
        .sign(privateKey);
}

function stubProvider(idToken: () => Promise<string>, otherIssuer: string | null = null): void {
    mintToken = idToken;
    discoveryIssuer = otherIssuer;
}

describe('OidcProviderService', () => {
    it('builds an authorization URL with PKCE S256, state and nonce', async () => {
        stubProvider(async () => '');
        const url = new URL(
            await new OidcProviderService(OPTIONS).authorizationUrl('st', 'no', 'ver'),
        );
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('code_challenge')).not.toBe('ver');
        expect(url.searchParams.get('state')).toBe('st');
        expect(url.searchParams.get('nonce')).toBe('no');
        expect(url.searchParams.get('response_type')).toBe('code');
    });

    it('accepts a valid token and sends the verifier with basic client auth', async () => {
        stubProvider(() => token({ sub: 'u1', email: ' A@Example.com ', nonce: 'n1' }));
        const claims = await new OidcProviderService(OPTIONS).exchange('code', 'ver', 'n1');
        expect(claims).toEqual({ sub: 'u1', email: 'A@Example.com' });
        expect(tokenRequest?.body).toContain('code_verifier=ver');
        expect(tokenRequest?.authorization).toMatch(/^Basic /);
    });

    it.each([
        ['wrong nonce', () => token({ sub: 'u1', nonce: 'other' })],
        [
            'wrong issuer',
            () => token({ sub: 'u1', nonce: 'n1' }, { iss: 'https://evil.example.com' }),
        ],
        ['wrong audience', () => token({ sub: 'u1', nonce: 'n1' }, { aud: 'client-b' })],
        ['expired', () => token({ sub: 'u1', nonce: 'n1' }, { exp: '-1m' })],
        [
            'unverified e-mail',
            () => token({ sub: 'u1', nonce: 'n1', email: 'a@b.c', email_verified: false }),
        ],
        [
            'unverified e-mail as a string',
            () => token({ sub: 'u1', nonce: 'n1', email: 'a@b.c', email_verified: 'False' }),
        ],
        ['no sub', () => token({ nonce: 'n1' })],
    ])('refuses a token with %s', async (_name, make) => {
        stubProvider(make);
        expect(await new OidcProviderService(OPTIONS).exchange('code', 'ver', 'n1')).toBeNull();
    });

    it('refuses a token signed by an unknown key', async () => {
        const other = await generateKeyPair('RS256');
        stubProvider(() =>
            new SignJWT({ sub: 'u1', nonce: 'n1' })
                .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
                .setIssuer(ISSUER)
                .setAudience('client-a')
                .setExpirationTime('5m')
                .sign(other.privateKey),
        );
        expect(await new OidcProviderService(OPTIONS).exchange('code', 'ver', 'n1')).toBeNull();
    });

    it('refuses a discovery document of another issuer', async () => {
        stubProvider(() => token({ sub: 'u1', nonce: 'n1' }), 'https://evil.example.com');
        expect(await new OidcProviderService(OPTIONS).exchange('code', 'ver', 'n1')).toBeNull();
    });

    it('gives a null email when the claim is absent', async () => {
        stubProvider(() => token({ sub: 'u1', nonce: 'n1' }));
        expect(await new OidcProviderService(OPTIONS).exchange('c', 'v', 'n1')).toEqual({
            sub: 'u1',
            email: null,
        });
    });
});
