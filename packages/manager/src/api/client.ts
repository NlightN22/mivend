const ADMIN_API_URL = '/admin-api';

// Portal auth is cookie-based, but Vendure echoes the bearer token in this header; the WS transport
// has no cookie jar (graphql-ws uses connectionParams), so it reuses this token.
const AUTH_TOKEN_HEADER = 'vendure-auth-token';
let capturedAuthToken: string | null = null;

export function getCapturedAuthToken(): string | null {
    return capturedAuthToken;
}

// Thrown only when the request never reached the server (fetch() TypeError), not on HTTP errors.
// Lets the auth store skip logout on transient blips such as a dev server restart.
export class ApiNetworkError extends Error {}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

// Without an explicit abort, a hung connection (no reset, no response) waits for the browser's
// default TCP timeout (tens of seconds) before the retry loop can kick in.
const REQUEST_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry only when fetch() itself throws (including our timeout abort), never on any HTTP response.
// An error response proves the server was reachable, so retrying would be pointless.
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

// Generated docs are plain strings (codegen documentMode: 'string') with phantom result types,
// so raw query strings and generated documents both fit the same parameter type.
interface TypedDocumentLike<TResult, TVariables> {
    toString(): string;
    __apiType?: (variables: TVariables) => TResult;
}

// Defaults to a loose record, not undefined, so callers that pass only TResult still type-check.
// Migrated call sites passing a TypedDocumentLike get TVariables inferred instead.
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
