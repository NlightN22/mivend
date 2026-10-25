import { createHash } from 'node:crypto';

// Backend-only (Node's `crypto`). Order-insensitive over the lists, so a reposted document with
// the same content hashes the same.
export function contentHash(header: unknown, lists: string[][]): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(header));
    for (const list of lists) {
        hash.update('\u0000');
        hash.update([...new Set(list)].sort().join('\u0001'));
    }
    return hash.digest('hex');
}
