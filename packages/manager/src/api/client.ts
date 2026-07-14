const ADMIN_API_URL = '/admin-api';

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

export async function adminApi<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const response = await fetchWithRetry(ADMIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Admin API error: ${response.status}`);
    }

    const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

    if (json.errors?.length) {
        throw new Error(json.errors.map(e => e.message).join('; '));
    }

    return json.data as T;
}
