export async function suggestAddress(query: string): Promise<string[]> {
    const response = await fetch('/shop-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            query: 'query($q:String!){ suggestAddress(query:$q) }',
            variables: { q: query },
        }),
    });
    const body = (await response.json()) as { data?: { suggestAddress?: string[] } };
    return body.data?.suggestAddress ?? [];
}
