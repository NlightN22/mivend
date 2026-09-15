const SHOP_API_URL = '/shop-api';

// Storefront auth is cookie-based (see the shop-api response's set-cookie), but the WS
// subscriptions transport (graphql-ws) has no cookie jar of its own and authenticates via
// connectionParams.authorization instead (see apps/server/src/subscriptions.ts) — captured here
// from the same vendure-auth-token response header Vendure sends regardless of tokenMethod.
const AUTH_TOKEN_HEADER = 'vendure-auth-token';
let capturedAuthToken: string | null = null;

export function getCapturedAuthToken(): string | null {
    return capturedAuthToken;
}

// Thrown only when the request never reached the server at all (connection refused, DNS
// failure, etc. — the browser's fetch() implementation throws a TypeError for these, distinct
// from a real HTTP/GraphQL error response). Callers (notably the auth store) use this to avoid
// treating a transient blip — e.g. the dev server mid-restart — as "the user is logged out".
// See the backend-plugin-rules skill's Vendure gotcha on this.
export class ApiNetworkError extends Error {}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

// Without this, a hung connection (no reset, just no response — the real-world case on a lossy
// VPN, confirmed live during issue #115's remote benchmark, same client shape as
// packages/manager/src/api/client.ts) relies on the browser's own default TCP timeout to ever
// throw and trigger a retry, which can run into the tens of seconds — the user just sees a stuck
// page with no feedback. Aborting explicitly caps that wait and lets the retry loop below
// actually do its job promptly instead of waiting on the OS.
const REQUEST_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retries only on a genuine network failure (fetch() itself throwing, including our own
// timeout-triggered abort below) — never on a real HTTP response, even an error one, since that
// means the server was reachable and responded.
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } catch (err) {
            lastError = err;
            if (attempt < RETRY_ATTEMPTS) {
                await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }
    throw new ApiNetworkError(lastError instanceof Error ? lastError.message : 'Network error');
}

// Structurally matches the `TypedDocumentString` class emitted by @graphql-codegen/typed-document-node
// (documentMode: 'string') into src/api/generated/graphql.ts — kept as a local structural type so
// this module doesn't need to import the generated file. `__apiType` only exists to carry
// TResult/TVariables at the type level; it's never assigned or read at runtime.
interface TypedDocumentLike<TResult, TVariables> {
    toString(): string;
    __apiType?: (variables: TVariables) => TResult;
}

export async function shopApi<
    TResult,
    TVariables extends Record<string, unknown> | undefined = undefined,
>(
    document: TypedDocumentLike<TResult, TVariables> | string,
    variables?: TVariables,
): Promise<TResult> {
    const query = typeof document === 'string' ? document : document.toString();
    const response = await fetchWithRetry(SHOP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    });

    const authToken = response.headers.get(AUTH_TOKEN_HEADER);
    if (authToken) {
        capturedAuthToken = authToken;
    }

    if (!response.ok) {
        throw new Error(`Shop API error: ${response.status}`);
    }

    const json = (await response.json()) as { data?: TResult; errors?: { message: string }[] };

    if (json.errors?.length) {
        throw new Error(json.errors.map(e => e.message).join('; '));
    }

    return json.data as TResult;
}
