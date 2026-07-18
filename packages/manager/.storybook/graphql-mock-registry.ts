// Generic GraphQL operation-name -> mock resolver registry, used by the MSW handler in
// preview.ts. Each page's story registers only the operations it actually calls; an
// unregistered operation resolves to `{}` so an unrelated background query never crashes
// the whole page render.
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
