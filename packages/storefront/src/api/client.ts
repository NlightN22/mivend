const SHOP_API_URL = '/shop-api';

// WS subscriptions (graphql-ws) have no cookie jar, so auth goes via connectionParams.authorization
// Token is taken from the vendure-auth-token header, which Vendure sends regardless of tokenMethod
const AUTH_TOKEN_HEADER = 'vendure-auth-token';
let capturedAuthToken: string | null = null;

export function getCapturedAuthToken(): string | null {
    return capturedAuthToken;
}

// Lets callers tell a transient outage (e.g. dev server restarting) from a real logout
// Only fires when the request never reached the server, not on HTTP/GraphQL errors
export class ApiNetworkError extends Error {
    name = 'ApiNetworkError';
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

// Browser's default TCP timeout can take tens of seconds on a hung connection (lossy VPN)
// Explicit abort caps the wait so the retry loop below fires promptly, not after OS timeout
const REQUEST_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry only when fetch() itself throws, including our own timeout abort
// An HTTP response, even an error one, proves the server was reachable, so never retry it
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

// Local structural copy of codegen's TypedDocumentString, to avoid importing the generated file
// __apiType carries TResult/TVariables at type level only; never assigned or read at runtime
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
