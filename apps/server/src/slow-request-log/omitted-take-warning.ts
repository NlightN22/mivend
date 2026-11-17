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
    let capReported = false;
    return (schema, document, variables, operationName) => {
        const fields = findOmittedTake(schema, document, variables);
        if (fields.length === 0) return;
        const message = `list query without take (Vendure defaults to 1000 rows): ${fields.join(', ')} in ${operationName ?? 'anonymous operation'}`;
        if (seen.has(message)) return;
        if (seen.size >= MAX_REMEMBERED) {
            if (!capReported)
                warn('omitted-take warnings capped; further new operations are not logged');
            capReported = true;
            return;
        }
        seen.add(message);
        warn(message);
    };
}
