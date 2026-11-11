// A read that can return every row of a table is a latent outage once the table grows.
// Exception: `// unbounded-ok: <reason>` above the statement; see docs/testing-strategy.md.
// Not seen: SQL from a helper/concatenation; a trailing ${fragment} after an identifier is assumed to be a limit.
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
const UNIQUE_SQL_KEY =
    /\bwhere\s+(?:\w+\.)?"?(?:id|erpId|uuid|externalId|customFieldsExternalid|customFieldsWarehouseerpid|customFieldsSourceorderid|customFieldsSourceadministratorid|token)"?(?:::text)?\s*=\s*(?:\$\d|any\s*\(\s*\$\d)/i;
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
        const allComments = sourceCode.getAllComments();
        const comments = allComments.filter(c => MARKER.test(c.value));

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

        function sqlText(arg) {
            if (!arg) return '';
            if (arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
            if (arg.type === 'TemplateLiteral')
                return arg.quasis.map(q => q.value.cooked).join('__x__');
            if (arg.type !== 'Identifier') return '';
            let scope = sourceCode.getScope(arg);
            while (scope) {
                const variable = scope.set.get(arg.name);
                if (variable) {
                    const defs = variable.defs;
                    const init =
                        defs.length === 1 && defs[0].type === 'Variable' ? defs[0].node.init : null;
                    return init && variable.references.filter(r => r.isWrite()).length === 1
                        ? sqlText(init)
                        : '';
                }
                scope = scope.upper;
            }
            return '';
        }

        function withoutSubselects(text) {
            const chars = [...text];
            const open = [];
            for (let i = 0; i < chars.length; i++) {
                if (chars[i] === '(') open.push(i);
                else if (chars[i] === ')' && open.length) {
                    const from = open.pop();
                    if (/\bselect\b/i.test(chars.slice(from, i).join('')))
                        for (let j = from + 1; j < i; j++) chars[j] = ' ';
                }
            }
            return chars.join('');
        }

        function checkRaw(node, arg, nameNode) {
            const text = sqlText(arg);
            if (!/^\s*(select|with)\b/i.test(text)) return;
            const tail = text.replace(/[\s;]+$/, '');
            if (
                /\b(limit\s+\S+(\s+offset\s+\S+)?|fetch\s+first\s+.+)(\s+for\s+(update|share)(\s+(skip\s+locked|nowait))?)?$/i.test(
                    tail,
                )
            )
                return;
            if (/[\w)"']\s+__x__$/i.test(tail)) return;
            if (/\b(insert\s+into|update\s+\S+(\s+\S+)?\s+set|delete\s+from)\b/i.test(text)) return;
            if (!/\bfrom\b/i.test(withoutSubselects(text))) return;
            if (UNIQUE_SQL_KEY.test(withoutSubselects(text))) return;
            if (
                /^\s*select\s+[(\s]*(?:select\s+)?(?:coalesce\(\s*)?(count|sum|max|min|avg|exists|1\b|pg_|now|current_)/i.test(
                    text,
                ) &&
                !/group\s+by/i.test(text)
            )
                return;
            report(node, nameNode);
        }

        function report(node, calleeProperty) {
            let stmt = node;
            while (stmt.parent && !/Statement|Declaration$/.test(stmt.type)) stmt = stmt.parent;
            let first = Math.min(node.loc.start.line, stmt.loc.start.line);
            for (let c = allComments.find(x => x.loc.end.line === first - 1); c; ) {
                first = c.loc.start.line;
                c = allComments.find(x => x.loc.end.line === first - 1);
            }
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
                if (callee.type === 'Identifier' && callee.name === 'ctxQuery') {
                    checkRaw(node, node.arguments[2], callee);
                    return;
                }
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
                    checkRaw(node, node.arguments[0], callee.property);
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
