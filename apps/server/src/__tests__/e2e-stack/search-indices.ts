function esHost(env: Record<string, string>): string {
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
