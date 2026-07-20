import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import noRawGraphql from './eslint-rules/no-raw-graphql.js';
import noSyncPaymentProcessing from './eslint-rules/no-sync-payment-processing.js';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'error',
            // allowExpressions: true is typescript-eslint's documented exemption for function
            // expressions that aren't part of a declaration (e.g. vue-router's
            // `component: () => import('...')` lazy routes, array/object literal callbacks) —
            // https://typescript-eslint.io/rules/explicit-function-return-type/. Named function
            // declarations and const-assigned arrow functions (the codebase's actual style for
            // exported/reusable functions) still require an explicit return type.
            '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'off',
        },
    },
    // Every Vendure `EventBus.ofType(X).subscribe(fn)` call in backend code must go through
    // `subscribeAndLog()` (packages/shared/src/vendure-events.ts) or `registerOutboxProducer()`
    // (packages/plugins/sync/src/producer-registry.ts, itself built on subscribeAndLog) —
    // never called directly. A bare `.subscribe(event => { void handler(event); })` makes any
    // rejection inside `handler` completely invisible (EventBus.publish() never awaits a
    // non-blocking subscriber), which is exactly how a real bug
    // (`ReservationService.setOrderReservationState` throwing on every call) went unnoticed
    // through multiple sessions — see docs/ai/PROJECT_CONTEXT.md, 2026-07-15. An audit that day
    // found the same gap in 4 more places across the codebase, all fixed the same way.
    {
        files: ['packages/plugins/**/*.ts', 'apps/server/**/*.ts'],
        ignores: [
            '**/*.test.ts',
            '**/__tests__/**',
            // The implementation itself is the one place allowed to call the real chain.
            'packages/shared/src/vendure-events.ts',
        ],
        languageOptions: { parser: tsParser },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "CallExpression[callee.property.name='subscribe'][callee.object.callee.property.name='ofType']",
                    message:
                        "Don't call eventBus.ofType(X).subscribe(fn) directly — an error inside fn is silently swallowed (EventBus.publish() never awaits non-blocking subscribers). Use subscribeAndLog() from 'shared' (or registerOutboxProducer() in plugin-sync) instead.",
                },
            ],
        },
    },
    // "One entity, one owning service" — any entity documented as having a single designated
    // writer/reader (read-model/projection tables, see AGENTS.md "Pagination"; generic
    // shared-infrastructure tables like the audit trail below) must only ever be imported by
    // that owning file, so it can't silently drift out of sync via a one-off write or an
    // unscoped query from somewhere else. Add a block here whenever a new such entity is
    // introduced; `ignores` lists every file allowed to import it (usually the owning service,
    // plus its resolver if the resolver only uses the entity for return-type annotations).
    {
        files: ['packages/plugins/price-entry/src/**/*.ts'],
        ignores: [
            'packages/plugins/price-entry/src/discount-registry.service.ts',
            // Only imports DiscountRegistryEntry for return-type annotations, never
            // queries/writes it directly — all access goes through DiscountRegistryService.
            'packages/plugins/price-entry/src/discount-registry.resolver.ts',
            // @VendurePlugin's `entities: [...]` array requires the class reference itself.
            'packages/plugins/price-entry/src/price-entry.plugin.ts',
        ],
        languageOptions: { parser: tsParser },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/discount-registry-entry.entity'],
                            message:
                                'DiscountRegistryEntry is a read-model/projection — only discount-registry.service.ts may import it. Add a method to DiscountRegistryService instead.',
                        },
                    ],
                },
            ],
        },
    },
    // EntityVersion (the generic audit-trail table any plugin can write to via
    // VersioningService.recordChange()) — same "one owning service" shape as above, already
    // documented as a convention in AGENTS.md; now also enforced.
    {
        files: ['packages/plugins/versioning/src/**/*.ts'],
        ignores: [
            'packages/plugins/versioning/src/versioning.service.ts',
            // Only imports EntityVersion for return-type annotations, never queries/writes it
            // directly — all access goes through VersioningService.
            'packages/plugins/versioning/src/versioning.resolver.ts',
            // @VendurePlugin's `entities: [...]` array requires the class reference itself.
            'packages/plugins/versioning/src/versioning.plugin.ts',
        ],
        languageOptions: { parser: tsParser },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/entity-version.entity'],
                            message:
                                'EntityVersion is shared audit-trail infrastructure — only VersioningService may import it. Call VersioningService.recordChange()/findForEntities() instead.',
                        },
                    ],
                },
            ],
        },
    },
    // AGENTS.md sync rules #5/#6: "plugin-sync owns RabbitMQ and the ERP adapter — nothing else
    // touches them" / "Branches never call the ERP." Other plugins publish/subscribe via
    // Vendure's EventBus instead. Enforced here rather than left to review, since an accidental
    // `import * as amqplib from 'amqplib'` or a direct ErpAdapter import elsewhere would compile
    // and run fine — nothing else would catch the boundary violation.
    {
        files: ['packages/plugins/**/*.ts', 'apps/server/**/*.ts'],
        ignores: ['packages/plugins/sync/**', '**/*.test.ts', '**/__tests__/**'],
        languageOptions: { parser: tsParser },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'amqplib',
                            message:
                                'RabbitMQ is owned exclusively by plugin-sync (AGENTS.md sync rule #5). Publish/subscribe via Vendure EventBus instead.',
                        },
                        {
                            name: 'amqp-connection-manager',
                            message:
                                'RabbitMQ is owned exclusively by plugin-sync (AGENTS.md sync rule #5). Publish/subscribe via Vendure EventBus instead.',
                        },
                    ],
                    patterns: [
                        {
                            group: ['**/erp-adapter.interface', '**/erp-adapter.stub', '@mivend/plugin-sync/**/erp-adapter*'],
                            message:
                                'The ERP adapter is owned exclusively by plugin-sync (AGENTS.md sync rule #6 — branches never call the ERP). Only plugin-sync may import it.',
                        },
                    ],
                },
            ],
        },
    },
    // All storefront GraphQL operations must go through codegen (packages/storefront/codegen.ts)
    // — a hand-written query/mutation string is invisible to the schema and can't be typed.
    // See AGENTS.md's storefront rule and docs/frontend.md.
    {
        files: ['packages/storefront/src/**/*.ts'],
        ignores: ['packages/storefront/src/api/generated/**', '**/__tests__/**'],
        languageOptions: { parser: tsParser },
        plugins: { local: { rules: { 'no-raw-graphql': noRawGraphql } } },
        rules: {
            'local/no-raw-graphql': 'error',
        },
    },
    // REST controllers and EventBus listeners — the actual entry points for external, unreliable
    // event sources (a webhook, an ERP/1C callback, a branch→central sync consumer) — must never
    // call a risky payment-processing method directly. See AGENTS.md sync rule #12 and
    // eslint-rules/no-sync-payment-processing.js's own header comment for the full rationale.
    // GraphQL *resolvers* are deliberately NOT in scope here: a mutation like `payInvoice` invoked
    // synchronously by an authenticated client (a "pay now" button waiting for a real-time
    // result) is a normal request/response command, not the "external system fired an event and
    // moved on" scenario rule #12 is about — an early version of this rule scoped resolvers too
    // and immediately false-positived on exactly that legitimate mutation.
    // `apps/server/src/payment-method-handlers.ts` is the one known, accepted exception: its
    // `onlineStubPaymentHandler` is a synchronous checkout-time stub (no real acquirer webhook
    // exists yet), called out explicitly in AGENTS.md as a demo stub to replace once real
    // acquiring is wired up — excluded here rather than silently passing, so the exception stays
    // visible.
    {
        files: ['packages/plugins/**/*.controller.ts', 'packages/plugins/**/*.listener.ts'],
        ignores: ['**/*.test.ts', '**/__tests__/**'],
        languageOptions: { parser: tsParser },
        plugins: { local: { rules: { 'no-sync-payment-processing': noSyncPaymentProcessing } } },
        rules: {
            'local/no-sync-payment-processing': 'error',
        },
    },
    prettierConfig, // must be last — disables rules that conflict with prettier
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/storybook-static/**',
            'infrastructure/scripts/**',
            // Codegen output (packages/storefront/codegen.ts) — never hand-edited, regenerated
            // from the schema + .graphql operation files.
            'packages/storefront/src/api/generated/**',
            // Plain Node CLI scripts (not app source, no `.ts`/tsconfig coverage) — same reasoning
            // as infrastructure/scripts/** above: only `**/*.ts` gets the `no-undef: 'off'`
            // override, so a bare `.mjs` Node script otherwise fails lint on ordinary `process`/
            // `console` globals since no Node environment is configured for plain JS files here.
            'packages/e2e/manual-driver.mjs',
        ],
    },
];
