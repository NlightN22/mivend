const ADMIN_API_URL = '/admin-api';

// The manager portal authenticates over the cookie session (tokenMethod: ['bearer', 'cookie']
// in vendure-config.ts), but Vendure still echoes the equivalent bearer token on every response
// via this header. Captured here so the WS subscriptions transport (notifications.ts) — which
// has no cookie jar of its own, since graphql-ws speaks connectionParams, not HTTP cookies — can
// authenticate the same session without a separate login flow.
const AUTH_TOKEN_HEADER = 'vendure-auth-token';
let capturedAuthToken: string | null = null;

export function getCapturedAuthToken(): string | null {
    return capturedAuthToken;
}

// Thrown only when the request never reached the server at all (connection refused, DNS
// failure, etc. — the browser's fetch() implementation throws a TypeError for these, distinct
// from a real HTTP/GraphQL error response). Callers (notably the auth store) use this to avoid
// treating a transient blip — e.g. the dev server mid-restart — as "the user is logged out".
// See AGENTS.md gotcha on this.
export class ApiNetworkError extends Error {}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retries only on a genuine network failure (fetch() itself throwing) — never on a real HTTP
// response, even an error one, since that means the server was reachable and responded.
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            return await fetch(url, init);
        } catch (err) {
            lastError = err;
            if (attempt < RETRY_ATTEMPTS) {
                await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
            }
        }
    }
    throw new ApiNetworkError(lastError instanceof Error ? lastError.message : 'Network error');
}

// Accepts either a raw query string (pre-codegen callers, migrating one file at a time per
// issue #86) or a generated TypedDocumentNode-like value (documentMode: 'string' in codegen.ts,
// so the generated Document constants are actual GraphQL strings with a phantom result/variables
// type attached) — same shape as packages/storefront/src/api/client.ts's shopApi().
interface TypedDocumentLike<TResult, TVariables> {
    toString(): string;
    __apiType?: (variables: TVariables) => TResult;
}

// TVariables defaults to the loose `Record<string, unknown> | undefined` (not `undefined`) so
// existing not-yet-migrated callers that only specify `<TResult>` explicitly (raw query string +
// a plain variables object) keep type-checking during the incremental migration (issue #86) —
// once a call site passes a real TypedDocumentLike, TVariables is inferred from it instead.
export async function adminApi<
    TResult = unknown,
    TVariables extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
>(
    document: TypedDocumentLike<TResult, TVariables> | string,
    variables?: TVariables,
): Promise<TResult> {
    const query = typeof document === 'string' ? document : document.toString();
    const response = await fetchWithRetry(ADMIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    });

    const authToken = response.headers?.get(AUTH_TOKEN_HEADER);
    if (authToken) {
        capturedAuthToken = authToken;
    }

    if (!response.ok) {
        throw new Error(`Admin API error: ${response.status}`);
    }

    const json = (await response.json()) as { data?: TResult; errors?: { message: string }[] };

    if (json.errors?.length) {
        throw new Error(json.errors.map(e => e.message).join('; '));
    }

    return json.data as TResult;
}
