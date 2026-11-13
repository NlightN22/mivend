// Local stand-in for an OpenID Connect provider (authorization code + PKCE). Test use only.
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const port = Number(process.env.MOCK_OIDC_PORT ?? 3995);
const base = `http://localhost:${port}`;
const issuer = `${base}/realms/staff`;
const clientId = process.env.MOCK_OIDC_CLIENT_ID ?? 'mivend-local';
const clientSecret = process.env.MOCK_OIDC_CLIENT_SECRET ?? 'mivend-local-secret';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'mock-1', alg: 'RS256', use: 'sig' };
const codes = new Map();
let identity = null;
const endedSessions = [];
let providerSession = false;

const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};
const readBody = req =>
    new Promise(done => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => done(data));
    });

async function token(req, res) {
    const form = new URLSearchParams(await readBody(req));
    const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const entry = codes.get(form.get('code'));
    codes.delete(form.get('code'));
    const challenge = createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url');
    if (req.headers.authorization !== expected || !entry || entry.challenge !== challenge) {
        return json(res, 400, { error: 'invalid_grant' });
    }
    const claims = { sub: entry.identity.sub, nonce: entry.nonce };
    if (entry.identity.email) claims.email = entry.identity.email;
    if (entry.identity.emailVerified !== undefined) {
        claims.email_verified = entry.identity.emailVerified;
    }
    const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'mock-1' })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setExpirationTime('5m')
        .sign(privateKey);
    return json(res, 200, { id_token: idToken, token_type: 'Bearer' });
}

createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === '/realms/staff/.well-known/openid-configuration') {
        return json(res, 200, {
            issuer,
            authorization_endpoint: `${issuer}/auth`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/certs`,
            end_session_endpoint: `${issuer}/logout`,
        });
    }
    if (url.pathname === '/realms/staff/certs') return json(res, 200, { keys: [jwk] });
    if (url.pathname === '/realms/staff/token' && req.method === 'POST') return token(req, res);
    if (url.pathname === '/realms/staff/auth') {
        const query = url.searchParams;
        if (!identity || query.get('client_id') !== clientId) return json(res, 400, {});
        providerSession = true;
        const code = randomUUID();
        codes.set(code, {
            identity,
            nonce: query.get('nonce'),
            challenge: query.get('code_challenge'),
        });
        const target = new URL(query.get('redirect_uri'));
        target.searchParams.set('code', code);
        target.searchParams.set('state', query.get('state'));
        res.writeHead(302, { location: target.toString() });
        return res.end();
    }
    if (url.pathname === '/realms/staff/logout') {
        const query = url.searchParams;
        providerSession = false;
        endedSessions.push({
            idTokenHint: query.get('id_token_hint'),
            clientId: query.get('client_id'),
        });
        const target = query.get('post_logout_redirect_uri');
        if (!target) return json(res, 200, { ok: true });
        res.writeHead(302, { location: target });
        return res.end();
    }
    if (url.pathname === '/_state') return json(res, 200, { providerSession, endedSessions });
    if (url.pathname === '/_control' && req.method === 'POST') {
        identity = JSON.parse(await readBody(req));
        return json(res, 200, { ok: true });
    }
    return json(res, 404, {});
}).listen(port, () => console.log(`mock oidc provider on ${base}`));
