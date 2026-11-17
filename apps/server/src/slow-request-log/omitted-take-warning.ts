import type { DocumentNode, GraphQLSchema } from 'graphql';

import { findOmittedTake } from './omitted-take';

const MAX_REMEMBERED = 500;

export function createOmittedTakeWarner(
    warn: (message: string) => void,
): (
    schema: GraphQLSchema,
    document: DocumentNode,
    variables: Record<string, unknown> | undefined,
    operationName: string | null | undefined,
) => void {
    const seen = new Set<string>();
    return (schema, document, variables, operationName) => {
        const fields = findOmittedTake(schema, document, variables);
        if (fields.length === 0) return;
        const message = `list query without take (Vendure defaults to 1000 rows): ${fields.join(', ')} in ${operationName ?? 'anonymous operation'}`;
        if (seen.has(message) || seen.size >= MAX_REMEMBERED) return;
        seen.add(message);
        warn(message);
    };
}
