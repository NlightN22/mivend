// Flags empty `catch {}` blocks and `.catch(() => undefined)` / `.catch(() => {})` — an error
// swallowed here is how the #188 tier-rebalance bug stayed hidden. See docs/concurrency.md (e).
// Escape hatch: `// concurrency-reviewed: <reason>` or `// best-effort: <reason>` on the line
// before (or inside the empty block).
const MARKER = /^\s*(concurrency-reviewed|best-effort):\s*\S/;

function isNoopHandler(arg) {
    if (!arg || arg.type !== 'ArrowFunctionExpression') return false;
    if (arg.body.type === 'BlockStatement') return arg.body.body.length === 0;
    return (
        (arg.body.type === 'Identifier' && arg.body.name === 'undefined') ||
        (arg.body.type === 'UnaryExpression' && arg.body.operator === 'void')
    );
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Disallow swallowing errors with an empty catch or a no-op .catch() unless marked as reviewed best-effort (docs/concurrency.md).',
        },
        schema: [],
    },
    create(context) {
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getAllComments();
        const hasMarker = (fromLine, toLine) =>
            comments.some(
                c =>
                    c.loc.end.line >= fromLine &&
                    c.loc.start.line <= toLine &&
                    MARKER.test(c.value),
            );

        function report(node, line, bodyRange) {
            const insideBody = bodyRange && hasMarker(bodyRange[0], bodyRange[1]);
            if (insideBody || hasMarker(line - 1, line)) return;
            context.report({
                node,
                message:
                    'Swallowed error. Log it at error level or rethrow; if intentional add `// best-effort: <reason>` or `// concurrency-reviewed: <reason>` on the preceding line (docs/concurrency.md).',
            });
        }

        return {
            CatchClause(node) {
                if (node.body.body.length > 0) return;
                report(node, node.loc.start.line, [node.loc.start.line, node.loc.end.line]);
            },
            CallExpression(node) {
                const callee = node.callee;
                if (
                    callee.type === 'MemberExpression' &&
                    callee.property.type === 'Identifier' &&
                    callee.property.name === 'catch' &&
                    isNoopHandler(node.arguments[0])
                ) {
                    report(node, callee.property.loc.start.line);
                }
            },
        };
    },
};
