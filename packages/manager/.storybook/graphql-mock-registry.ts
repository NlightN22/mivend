// Unregistered operations resolve to {} (see preview.ts MSW handler), so a stray background
// query can't crash the page render; stories register only the ops they actually call.
type MockResolver = (variables: Record<string, unknown>) => unknown;

const registry = new Map<string, MockResolver>();

export function registerMock(operationName: string, resolver: MockResolver): void {
    registry.set(operationName, resolver);
}

export function resolveMock(operationName: string, variables: Record<string, unknown>): unknown {
    const resolver = registry.get(operationName);
    return resolver ? resolver(variables) : {};
}

export function resetMocks(): void {
    registry.clear();
}

export function extractOperationName(query: string): string | null {
    const match = /^\s*(?:query|mutation)\s+(\w+)/.exec(query);
    return match ? match[1] : null;
}
