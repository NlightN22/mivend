// Every DB call goes through the RequestContext's transaction (docs/concurrency.md, "Connections"):
// a second pool connection inside a transaction deadlocks the server once the pool is exhausted.
export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow rawConnection, DataSource and ctx-less getRepository; use getRepository(ctx, ...).',
        },
        schema: [],
    },
    create(context) {
        function report(node, what) {
            context.report({
                node,
                message: `${what} bypasses the request transaction. Use connection.getRepository(ctx, ...) or withTransaction(ctx, ...) (docs/concurrency.md).`,
            });
        }
        return {
            MemberExpression(node) {
                if (!node.computed && node.property.name === 'rawConnection')
                    report(node, 'rawConnection');
            },
            ImportSpecifier(node) {
                const source = node.parent.source.value;
                const name = node.imported.name;
                if (source === 'typeorm' && name === 'DataSource') report(node, 'DataSource');
                if (source === '@nestjs/typeorm' && name === 'InjectDataSource')
                    report(node, 'InjectDataSource');
            },
            CallExpression(node) {
                const callee = node.callee;
                if (
                    callee.type === 'MemberExpression' &&
                    !callee.computed &&
                    callee.property.name === 'getRepository' &&
                    node.arguments.length === 1 &&
                    /connection$/i.test(
                        callee.object.type === 'MemberExpression'
                            ? (callee.object.property.name ?? '')
                            : (callee.object.name ?? ''),
                    )
                )
                    report(node, 'getRepository without ctx');
            },
        };
    },
};
