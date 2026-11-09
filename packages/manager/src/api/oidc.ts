import { adminApi } from './client';
import {
    AuthenticateOidcDocument,
    CompleteOidcSignInDocument,
    OidcSignInDocument,
    PrepareOidcSignOutDocument,
    StartOidcSignInDocument,
} from './generated/graphql';

export async function fetchOidcSignIn(): Promise<{ host: string; iconUrl: string } | null> {
    const { oidcSignIn } = await adminApi(OidcSignInDocument);
    return oidcSignIn;
}

export async function fetchAuthorizationUrl(): Promise<string> {
    const { startOidcSignIn } = await adminApi(StartOidcSignInDocument);
    return startOidcSignIn.authorizationUrl;
}

export async function completeOidcSignIn(code: string, state: string): Promise<boolean> {
    const { completeOidcSignIn: verified } = await adminApi(CompleteOidcSignInDocument, {
        code,
        state,
    });
    return verified;
}

export async function openOidcSession(state: string): Promise<boolean> {
    const { authenticate } = await adminApi(AuthenticateOidcDocument, { state });
    return authenticate.__typename === 'CurrentUser';
}

// The provider logout URL for a provider-opened session; null for local sessions or when the provider cannot be reached.
export async function fetchProviderSignOutUrl(): Promise<string | null> {
    const { prepareOidcSignOut } = await adminApi(PrepareOidcSignOutDocument);
    return prepareOidcSignOut ?? null;
}
