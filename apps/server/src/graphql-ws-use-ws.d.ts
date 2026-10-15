// tsconfig moduleResolution predates package.json "exports", so TS can't resolve graphql-ws/use/ws.
// Type-check gap only (Node resolves it at runtime); avoids widening moduleResolution project-wide.
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
