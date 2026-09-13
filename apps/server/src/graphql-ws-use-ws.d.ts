// tsconfig.base.json's moduleResolution predates package.json "exports" subpath resolution, so TS
// can't resolve graphql-ws's documented `graphql-ws/use/ws` entry point on its own (Node resolves
// it fine at runtime — this is purely a type-checking gap). Ambient-declare the one export
// subscriptions.ts actually uses rather than widen moduleResolution project-wide for one import.
declare module 'graphql-ws/use/ws' {
    import type { WebSocketServer } from 'ws';
    import type { GraphQLSchema } from 'graphql';

    export function useServer(
        options: {
            schema: GraphQLSchema;
            context?: (ctx: { connectionParams?: Record<string, unknown> }) => unknown;
        },
        server: WebSocketServer,
    ): { dispose: () => Promise<void> };
}
