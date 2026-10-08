// Outbound integration events must go through OutboundGateway (issue #200): it is the only place
// that records every outcome (pending / skipped / failed) so nothing is dropped silently. Importing
// IntegrationOutboxService or KafkaProducerService anywhere else is a way to bypass it.
// Scoped in eslint.config.js: the gateway, the outbox service itself, the publisher/recovery
// services and the plugin module are exempt, as are tests.
const FORBIDDEN_IMPORTS = new Set(['IntegrationOutboxService', 'KafkaProducerService']);

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow using IntegrationOutboxService/KafkaProducerService directly; enqueue outbound events through OutboundGateway.',
        },
        schema: [],
    },
    create(context) {
        return {
            ImportSpecifier(node) {
                const name = node.imported.name ?? node.imported.value;
                if (FORBIDDEN_IMPORTS.has(name)) {
                    context.report({
                        node,
                        message: `'${name}' must not be used directly: enqueue outbound events through OutboundGateway so every outcome (pending/skipped/failed) is recorded (issue #200).`,
                    });
                }
            },
        };
    },
};
