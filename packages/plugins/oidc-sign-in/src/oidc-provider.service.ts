import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { s256Challenge } from './oidc-crypto';
import { HTTP_TIMEOUT_MS, OIDC_PLUGIN_OPTIONS, loggerCtx } from './oidc.types';
import type { OidcClaims, OidcPluginOptions } from './oidc.types';

interface Discovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
}

const DISCOVERY_TTL_MS = 60 * 60_000;
const SIGNING_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384', 'EdDSA'];

// Talks to the provider only; every failure is logged here and answered as null, so callers cannot leak a reason.
@Injectable()
export class OidcProviderService {
    private discovery: { value: Discovery; at: number } | null = null;
    private jwks: { uri: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null;

    constructor(@Inject(OIDC_PLUGIN_OPTIONS) private options: OidcPluginOptions | null) {}

    get enabled(): boolean {
        return this.options !== null;
    }

    private get config(): OidcPluginOptions {
        if (!this.options) throw new Error('OIDC sign-in is not configured');
        return this.options;
    }

    private async discover(): Promise<Discovery> {
        if (this.discovery && Date.now() - this.discovery.at < DISCOVERY_TTL_MS) {
            return this.discovery.value;
        }
        const issuer = this.config.issuer.replace(/\/+$/, '');
        const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`discovery answered ${response.status}`);
        const value = (await response.json()) as Discovery;
        if (value.issuer !== this.config.issuer) throw new Error('discovery issuer mismatch');
        this.discovery = { value, at: Date.now() };
        return value;
    }

    async authorizationUrl(state: string, nonce: string, verifier: string): Promise<string> {
        const { authorization_endpoint } = await this.discover().catch((error: Error) => {
            Logger.error(`OIDC discovery failed: ${error.message}`, loggerCtx);
            throw new Error('OIDC sign-in is unavailable');
        });
        const url = new URL(authorization_endpoint);
        url.search = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: 'openid email',
            state,
            nonce,
            code_challenge: s256Challenge(verifier),
            code_challenge_method: 'S256',
        }).toString();
        return url.toString();
    }

    async exchange(code: string, verifier: string, nonce: string): Promise<OidcClaims | null> {
        try {
            const discovery = await this.discover();
            const idToken = await this.requestToken(discovery, code, verifier);
            return await this.verifyIdToken(discovery, idToken, nonce);
        } catch (error) {
            Logger.warn(`OIDC code exchange refused: ${(error as Error).message}`, loggerCtx);
            return null;
        }
    }

    private async requestToken(
        discovery: Discovery,
        code: string,
        verifier: string,
    ): Promise<string> {
        const { clientId, clientSecret, redirectUri } = this.config;
        const basic = Buffer.from(
            `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
        ).toString('base64');
        const response = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                authorization: `Basic ${basic}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            }),
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`token endpoint answered ${response.status}`);
        const body = (await response.json()) as { id_token?: unknown };
        if (typeof body.id_token !== 'string') throw new Error('no id_token in the answer');
        return body.id_token;
    }

    private async verifyIdToken(
        discovery: Discovery,
        idToken: string,
        nonce: string,
    ): Promise<OidcClaims> {
        if (this.jwks?.uri !== discovery.jwks_uri) {
            this.jwks = {
                uri: discovery.jwks_uri,
                keys: createRemoteJWKSet(new URL(discovery.jwks_uri), {
                    timeoutDuration: HTTP_TIMEOUT_MS,
                }),
            };
        }
        const { payload } = await jwtVerify(idToken, this.jwks.keys, {
            issuer: this.config.issuer,
            audience: this.config.clientId,
            algorithms: SIGNING_ALGORITHMS,
            requiredClaims: ['exp', 'sub'],
        });
        if (payload.nonce !== nonce) throw new Error('nonce mismatch');
        if (payload.email_verified === false) throw new Error('e-mail not verified');
        if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('no sub');
        const email = typeof payload.email === 'string' ? payload.email.trim() : '';
        return { sub: payload.sub, email: email === '' ? null : email };
    }
}
