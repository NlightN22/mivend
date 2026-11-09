import { adminApi } from './client';
import {
    AuthenticateOidcDocument,
    CompleteOidcSignInDocument,
    OidcSignInEnabledDocument,
    StartOidcSignInDocument,
} from './generated/graphql';

export async function fetchOidcEnabled(): Promise<boolean> {
    const { oidcSignInEnabled } = await adminApi(OidcSignInEnabledDocument);
    return oidcSignInEnabled;
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
