// Flags direct calls to risky, synchronous payment-processing methods from REST controllers,
// GraphQL resolvers, and EventBus listeners — see AGENTS.md sync rule #12: a critical inbound
// event must be durably enqueued (real inbox, pending/processing/processed/failed) and processed
// asynchronously by a retry-capable worker, never processed inline as part of accepting it.
//
// This is a denylist, not a heuristic over "looks risky" — arbitrary business-logic naming can't
// be judged reliably by an AST rule, but a short, explicit list of known risky-processing methods
// can. Add to RISKY_METHOD_NAMES whenever a new such method is introduced elsewhere in the
// codebase (e.g. a future shipping-provider callback's own "apply shipment status" method).
//
// Legitimate call sites for these methods are the inbox worker/processor itself and an explicit
// ops "run now" trigger — both call the method as their entire job, not as a side effect of
// accepting an inbound request, so this rule is scoped (via eslint.config.js `files`/`ignores`)
// to controller/resolver/listener files only, not to `payment-inbox-processor.service.ts` or the
// worker.
const RISKY_METHOD_NAMES = new Set(['payInvoice']);

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow calling risky/synchronous payment-processing methods directly from controllers, resolvers, or event listeners — route through the inbox/worker instead (AGENTS.md sync rule #12).',
        },
        schema: [],
    },
    create(context) {
        return {
            CallExpression(node) {
                const callee = node.callee;
                if (
                    callee.type === 'MemberExpression' &&
                    callee.property.type === 'Identifier' &&
                    RISKY_METHOD_NAMES.has(callee.property.name)
                ) {
                    context.report({
                        node,
                        message: `Direct call to '${callee.property.name}' from a controller/resolver/event-listener is the synchronous-processing anti-pattern (AGENTS.md sync rule #12). Enqueue the event into the inbox instead and let the worker process it.`,
                    });
                }
            },
        };
    },
};
