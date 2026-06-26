const SHOP_API_URL = '/shop-api';

export async function shopApi<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const response = await fetch(SHOP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Shop API error: ${response.status}`);
    }

    const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

    if (json.errors?.length) {
        throw new Error(json.errors.map(e => e.message).join('; '));
    }

    return json.data as T;
}
