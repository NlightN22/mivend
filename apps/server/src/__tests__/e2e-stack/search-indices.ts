export function esHost(env: Record<string, string>): string {
    return env.ELASTICSEARCH_HOST || 'http://localhost:9200';
}

export async function deleteIndices(env: Record<string, string>, prefix: string): Promise<void> {
    const host = esHost(env);
    const res = await fetch(`${host}/_cat/indices/${prefix}*?format=json&h=index`);
    if (!res.ok) throw new Error(`Elasticsearch GET _cat/indices: ${res.status}`);
    for (const { index } of (await res.json()) as { index: string }[]) {
        const deleted = await fetch(`${host}/${index}`, { method: 'DELETE' });
        if (!deleted.ok && deleted.status !== 404)
            throw new Error(`Elasticsearch DELETE ${index}: ${deleted.status}`);
    }
}

interface AliasMap {
    [index: string]: { aliases: Record<string, unknown> };
}

async function esCall(url: string, method: string, body?: unknown): Promise<unknown> {
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`Elasticsearch ${method} ${url}: ${res.status} ${await res.text()}`);
    return res.json();
}

// A clone needs a write-blocked source; the template's indices stay blocked for good.
export async function blockIndexWrites(env: Record<string, string>, prefix: string): Promise<void> {
    const host = esHost(env);
    const found = (await esCall(`${host}/${prefix}*/_alias`, 'GET')) as AliasMap;
    for (const index of Object.keys(found))
        await esCall(`${host}/${index}/_settings`, 'PUT', { 'index.blocks.write': true });
}

export async function cloneIndices(
    env: Record<string, string>,
    from: string,
    to: string,
): Promise<void> {
    const host = esHost(env);
    const found = (await esCall(`${host}/${from}*/_alias`, 'GET')) as AliasMap;
    for (const [index, { aliases }] of Object.entries(found)) {
        const renamed = Object.fromEntries(
            Object.keys(aliases).map(alias => [to + alias.slice(from.length), {}]),
        );
        await esCall(
            `${host}/${index}/_clone/${to}${index.slice(from.length)}?wait_for_active_shards=all`,
            'POST',
            {
                settings: { 'index.blocks.write': null },
                aliases: renamed,
            },
        );
    }
}
