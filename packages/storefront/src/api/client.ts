const SHOP_API_URL = '/shop-api';

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

    if (!response.ok) {
        throw new Error(`Shop API error: ${response.status}`);
    }

    const json = (await response.json()) as { data?: TResult; errors?: { message: string }[] };

    if (json.errors?.length) {
        throw new Error(json.errors.map(e => e.message).join('; '));
    }

    return json.data as TResult;
}
