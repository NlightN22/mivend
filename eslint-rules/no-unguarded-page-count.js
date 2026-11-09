// take: 0 means "no limit" to TypeORM, so a bare getManyAndCount() on a client-paged list hydrates
// every row. Use getPageAndCount() from 'shared' (packages/shared/src/paginate-query.ts).
export default {
    meta: {
        type: 'problem',
        docs: { description: 'Disallow direct getManyAndCount() and findAndCount().' },
        schema: [],
    },
    create(context) {
        return {
            CallExpression(node) {
                const callee = node.callee;
                if (
                    callee.type === 'MemberExpression' &&
                    !callee.computed &&
                    (callee.property.name === 'getManyAndCount' ||
                        callee.property.name === 'findAndCount')
                )
                    context.report({
                        node,
                        message: `${callee.property.name}() hydrates every row when take is 0. Use getPageAndCount() from 'shared'; if the query is bounded and never client-paged, disable with a reason.`,
                    });
            },
        };
    },
};
