// Outbound integration events must go through OutboundGateway (issue #200): it is the only place
// that records every outcome (pending / skipped / failed). Scoped in eslint.config.js: the gateway,
// the outbox services, the plugin module and migrations are exempt, as are tests.
// Covered: named/default/namespace imports, re-exports, dynamic import() and require() of the
// outbox service, the Kafka producer or the outbox entity (by file or by package), and string
// literals that write to the integration_outbox table with raw SQL.
// Not covered: a producer reaching the table through an untyped repository name built at runtime.
const FORBIDDEN_NAMES = new Set([
    'IntegrationOutboxService',
    'KafkaProducerService',
    'IntegrationOutboxEntry',
]);
const FORBIDDEN_SOURCE =
    /(integration-outbox\.service|kafka-producer\.service|integration-outbox-entry\.entity)(\.[jt]s)?$/;
const PACKAGE = '@mivend/plugin-erp-integration';
const RAW_OUTBOX_WRITE = /\b(insert\s+into|update|delete\s+from)\s+"?integration_outbox"?(\s|$)/i;

const HELP =
    'enqueue outbound events through OutboundGateway so every outcome (pending/skipped/failed) is recorded (issue #200).';

const importedName = specifier => specifier.imported?.name ?? specifier.imported?.value ?? null;
const exportedLocalName = specifier => specifier.local?.name ?? specifier.local?.value ?? null;

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow using the outbox service/entity, the Kafka producer or raw outbox SQL directly; enqueue outbound events through OutboundGateway.',
        },
        schema: [],
    },
    create(context) {
        const report = (node, what) =>
            context.report({ node, message: `${what} must not be used directly: ${HELP}` });

        const checkSource = (node, source, names) => {
            if (typeof source !== 'string') return;
            if (FORBIDDEN_SOURCE.test(source)) {
                report(node, `'${source}'`);
                return;
            }
            if (source !== PACKAGE) return;
            const hit = names.find(name => name === '*' || FORBIDDEN_NAMES.has(name));
            if (hit) report(node, hit === '*' ? `a namespace import of '${PACKAGE}'` : `'${hit}'`);
        };

        const checkText = (node, text) => {
            if (RAW_OUTBOX_WRITE.test(text)) report(node, 'Raw SQL writing to integration_outbox');
        };

        return {
            ImportDeclaration(node) {
                const names = node.specifiers.map(s =>
                    s.type === 'ImportNamespaceSpecifier' ? '*' : importedName(s),
                );
                checkSource(node, node.source.value, names);
            },
            ExportNamedDeclaration(node) {
                if (!node.source) return;
                checkSource(node, node.source.value, node.specifiers.map(exportedLocalName));
            },
            ExportAllDeclaration(node) {
                checkSource(node, node.source.value, ['*']);
            },
            ImportExpression(node) {
                if (node.source.type === 'Literal') checkSource(node, node.source.value, ['*']);
            },
            CallExpression(node) {
                if (
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments[0]?.type === 'Literal'
                ) {
                    checkSource(node, node.arguments[0].value, ['*']);
                }
            },
            Literal(node) {
                if (typeof node.value === 'string') checkText(node, node.value);
            },
            TemplateElement(node) {
                checkText(node, node.value.cooked ?? '');
            },
        };
    },
};
