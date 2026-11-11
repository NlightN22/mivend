// A read that can return every row of a table is a latent outage once the table grows.
// Exception: `// unbounded-ok: <reason>` above the statement; see docs/testing-strategy.md.
const READ_METHODS = new Set(['find', 'findBy', 'findAndCount', 'findAndCountBy']);
const QB_TERMINALS = new Set([
    'getMany',
    'getRawMany',
    'getManyAndCount',
    'getRawAndEntities',
    'stream',
]);
const BOUNDING = new Set(['take', 'limit']);
const QB_HINTS = new Set([
    'createQueryBuilder',
    'where',
    'andWhere',
    'select',
    'from',
    'leftJoin',
    'innerJoin',
    'leftJoinAndSelect',
    'innerJoinAndSelect',
    'orderBy',
]);
const REPO_NAME = /repo|repository|manager|connection|\bem\b/i;
const PLACEHOLDERS =
    /^(todo|fixme|tbd|ok|n\/a|na|none|because|fine|needed|required|legacy|temp|wip|skip|ignore|\.+|-+)$/i;
const MARKER = /unbounded-ok:\s*([\s\S]*)$/;

function receiverName(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && !node.computed) return node.property.name;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression')
        return node.callee.property.name === 'getRepository' ? 'repository' : '';
    if (node.type === 'TSNonNullExpression') return receiverName(node.expression);
    return '';
}

const UNIQUE_KEYS = new Set(['id', 'uuid', 'erpId']);

function filtersByUniqueKey(objectNode) {
    const where = objectNode.properties.find(p => p.type === 'Property' && p.key.name === 'where');
    return (
        where?.value.type === 'ObjectExpression' &&
        where.value.properties.some(p => p.type === 'Property' && UNIQUE_KEYS.has(p.key.name))
    );
}

function hasTake(objectNode) {
    return (
        filtersByUniqueKey(objectNode) ||
        objectNode.properties.some(
            p =>
                p.type === 'SpreadElement' ||
                (p.type === 'Property' &&
                    ((p.key.name === 'take' &&
                        !(p.value.type === 'Literal' && p.value.value === 0)) ||
                        p.key.value === 'take')),
        )
    );
}

function reasonProblem(raw) {
    const reason = raw.replace(/\*\/\s*$/, '').trim();
    if (/^TRACKED\s+#\d+\s+\S+/.test(reason)) return null;
    if (/^TRACKED parallel-fix documents$/.test(reason)) return null;
    if (PLACEHOLDERS.test(reason) || reason.split(/\s+/).length < 3 || reason.length < 15)
        return 'unbounded-ok needs a specific reason naming the bound (at least 3 words)';
    return null;
}

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Disallow reads that can return an unbounded number of rows.' },
        schema: [],
    },
    create(context) {
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getAllComments().filter(c => MARKER.test(c.value));

        function isBoundedVariable(identifier) {
            let scope = sourceCode.getScope(identifier);
            while (scope) {
                const variable = scope.set.get(identifier.name);
                if (variable)
                    return variable.references.some(ref => {
                        const parent = ref.identifier.parent;
                        return (
                            parent.type === 'MemberExpression' &&
                            parent.object === ref.identifier &&
                            BOUNDING.has(parent.property.name)
                        );
                    });
                scope = scope.upper;
            }
            return false;
        }

        function chainInfo(call) {
            const names = [];
            let current = call.callee.object;
            while (current) {
                if (current.type === 'AwaitExpression' || current.type === 'TSNonNullExpression') {
                    current = current.argument ?? current.expression;
                } else if (
                    current.type === 'CallExpression' &&
                    current.callee.type === 'MemberExpression'
                ) {
                    names.push(current.callee.property.name);
                    current = current.callee.object;
                } else break;
            }
            return { names, base: current };
        }

        function report(node, calleeProperty) {
            let stmt = node;
            while (stmt.parent && !/Statement|Declaration$/.test(stmt.type)) stmt = stmt.parent;
            const first = Math.min(node.loc.start.line, stmt.loc.start.line) - 1;
            const last = calleeProperty.loc.start.line;
            const marker = comments.find(c => c.loc.end.line >= first && c.loc.start.line <= last);
            if (!marker) {
                context.report({
                    node,
                    message: `${calleeProperty.name}() can return an unbounded number of rows. Add take/limit or paginate; if the table has a hard small bound, add "// unbounded-ok: <reason naming the bound>".`,
                });
                return;
            }
            const problem = reasonProblem(MARKER.exec(marker.value)[1].split('\n')[0]);
            if (problem) context.report({ node, message: problem });
        }

        return {
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== 'MemberExpression' || callee.computed) return;
                const name = callee.property.name;

                if (QB_TERMINALS.has(name)) {
                    const { names, base } = chainInfo(node);
                    if (names.some(n => BOUNDING.has(n))) return;
                    if (name === 'stream' && !names.some(n => QB_HINTS.has(n))) return;
                    if (name === 'getRawAndEntities' && names.length === 0 && !base) return;
                    if (base && base.type === 'Identifier' && isBoundedVariable(base)) return;
                    report(node, callee.property);
                    return;
                }

                if (name === 'query') {
                    const arg = node.arguments[0];
                    const text =
                        arg && arg.type === 'Literal' && typeof arg.value === 'string'
                            ? arg.value
                            : arg && arg.type === 'TemplateLiteral'
                              ? arg.quasis.map(q => q.value.cooked).join(' ')
                              : '';
                    if (!/^\s*(select|with)\b/i.test(text) || /\blimit\b/i.test(text)) return;
                    if (/\b(insert\s+into|update\s+\S+\s+set|delete\s+from)\b/i.test(text)) return;
                    if (!/\bfrom\b/i.test(text) || /\bwhere\s+"?id"?\s*=\s*\$\d/i.test(text))
                        return;
                    if (
                        /^\s*select\s+(count|sum|max|min|avg|exists|1\b|pg_|now|current_)/i.test(
                            text,
                        ) &&
                        !/group\s+by/i.test(text)
                    )
                        return;
                    report(node, callee.property);
                    return;
                }

                if (!READ_METHODS.has(name)) return;
                const args = node.arguments;
                const repoLike = REPO_NAME.test(receiverName(callee.object));
                if (name === 'findBy' || name === 'findAndCountBy') {
                    const arg = args[0];
                    if (
                        arg?.type === 'ObjectExpression' &&
                        arg.properties.some(
                            p => p.type === 'Property' && UNIQUE_KEYS.has(p.key.name),
                        )
                    )
                        return;
                    if (repoLike || args.length) report(node, callee.property);
                    return;
                }
                if (!repoLike && !args.some(a => a.type === 'ObjectExpression')) return;
                if (args.length && args[0].type === 'ArrowFunctionExpression') return;
                if (args.length && args[0].type === 'FunctionExpression') return;
                const options = args.length > 1 ? args[1] : args.length === 1 ? args[0] : undefined;
                if (!repoLike && !(options && options.type === 'ObjectExpression')) return;
                if (options && options.type === 'ObjectExpression' && hasTake(options)) return;
                if (options && options.type !== 'ObjectExpression' && !repoLike) return;
                report(node, callee.property);
            },
        };
    },
};
