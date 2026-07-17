// Flags hand-written GraphQL operation strings so storefront code can't drift back to
// raw shopApi<T>(query, vars) calls once codegen (packages/storefront/codegen.ts) is in place —
// see AGENTS.md's "All GraphQL operations must be typed via codegen" rule.
const OPERATION_KEYWORD_PATTERN = /\b(query|mutation|fragment)\s+\w*\s*[{(]/;

function textOf(node) {
    if (node.type === 'TemplateLiteral') {
        return node.quasis.map(q => q.value.cooked ?? '').join('');
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }
    return null;
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow hand-written GraphQL operation strings outside src/api/generated — use codegen-generated typed documents instead.',
        },
        schema: [],
    },
    create(context) {
        return {
            TaggedTemplateExpression(node) {
                if (node.tag.type === 'Identifier' && node.tag.name === 'gql') {
                    context.report({
                        node,
                        message:
                            "Raw gql`...` template literal — add the operation to a co-located .graphql file and run `pnpm codegen` instead.",
                    });
                }
            },
            'TemplateLiteral, Literal'(node) {
                const text = textOf(node);
                if (text && OPERATION_KEYWORD_PATTERN.test(text)) {
                    context.report({
                        node,
                        message:
                            'Raw GraphQL operation string — add it to a co-located .graphql file and run `pnpm codegen` instead of hand-writing the query/mutation.',
                    });
                }
            },
        };
    },
};
