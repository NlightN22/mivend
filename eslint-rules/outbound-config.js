import tsParser from '@typescript-eslint/parser';

import noDirectOutbound from './no-direct-outbound.js';

// Issue #200: where no-direct-outbound applies; the gateway, the outbox/producer services, the
// plugin module and migrations legitimately use the forbidden classes.
export default {
    files: ['packages/plugins/**/*.ts', 'apps/**/*.ts'],
    ignores: [
        '**/*.test.ts',
        '**/__tests__/**',
        'packages/plugins/erp-integration/src/outbound-gateway.ts',
        'packages/plugins/erp-integration/src/integration-outbox.service.ts',
        'packages/plugins/erp-integration/src/integration-outbox-processor.service.ts',
        'packages/plugins/erp-integration/src/integration-outbox-recovery.service.ts',
        'packages/plugins/erp-integration/src/kafka-producer.service.ts',
        // Read-only list model for the health pages: selects rows, never writes or publishes.
        'packages/plugins/erp-integration/src/integration-event-list.service.ts',
        'packages/plugins/erp-integration/src/erp-integration.plugin.ts',
        'packages/plugins/erp-integration/src/plugin-entities.ts',
        'apps/server/src/migrations/**',
    ],
    languageOptions: { parser: tsParser },
    plugins: { outbound: { rules: { 'no-direct-outbound': noDirectOutbound } } },
    rules: { 'outbound/no-direct-outbound': 'error' },
};
