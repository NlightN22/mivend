// Flags pg_advisory_lock / pg_advisory_xact_lock strings outside the shared helper — all
// advisory locks go through `withAggregateLock` (packages/shared/src/aggregate-lock.ts).
const RAW_LOCK = /pg_(try_)?advisory_(xact_)?lock/;

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Disallow raw Postgres advisory-lock SQL; use withAggregateLock.' },
        schema: [],
    },
    create(context) {
        function check(node, text) {
            if (RAW_LOCK.test(text)) {
                context.report({
                    node,
                    message:
                        'Raw advisory-lock SQL. Use withAggregateLock() from shared (docs/concurrency.md).',
                });
            }
        }
        return {
            Literal(node) {
                if (typeof node.value === 'string') check(node, node.value);
            },
            TemplateElement(node) {
                check(node, node.value.cooked ?? '');
            },
        };
    },
};
