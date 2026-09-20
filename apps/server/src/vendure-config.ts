import path from 'path';
import { readFileSync } from 'fs';
import { DefaultSchedulerPlugin, LanguageCode, VendureConfig } from '@vendure/core';
import { DateStampedOrderCodeStrategy } from './order-code.strategy';
import { CustomerPriceCalculationStrategy } from './customer-price-calculation.strategy';
import { offlineTermsPaymentHandler, onlineStubPaymentHandler } from './payment-method-handlers';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import {
    EmailPlugin,
    FileBasedTemplateLoader,
    emailVerificationHandler,
    passwordResetHandler,
    emailAddressChangeHandler,
} from '@vendure/email-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { BullMQJobQueuePlugin } from '@vendure/job-queue-plugin/package/bullmq';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { ErpImportPlugin } from '@mivend/plugin-erp-import';
import { CrossReferencePlugin } from '@mivend/plugin-cross-reference';
import { searchPlugins } from '@mivend/plugin-search';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { SyncPlugin, StubErpAdapter } from '@mivend/plugin-sync';
import {
    ErpIntegrationPlugin,
    BranchStockLocationStrategy,
    Manufacturer,
} from '@mivend/plugin-erp-integration';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { PopularProductsPlugin } from '@mivend/plugin-popular-products';
import { AccessControlPlugin, CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { ReservationPlugin } from '@mivend/plugin-reservation';
import { NotificationPlugin } from '@mivend/plugin-notification';
import { MoqPlugin } from '@mivend/plugin-moq';
import { VersioningPlugin } from '@mivend/plugin-versioning';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import { AcquiringPlugin } from '@mivend/plugin-acquiring';
import { SavedViewsPlugin } from '@mivend/plugin-saved-views';
import { SystemHealthDashboardPlugin } from './system-health-dashboard.plugin';
import { DefaultSuperadminAlertDashboardPlugin } from './default-superadmin-alert-dashboard.plugin';
import { BranchConsolidationAlertDashboardPlugin } from './branch-consolidation-alert-dashboard.plugin';
import { IntegrationHealthDashboardPlugin } from './integration-health-dashboard.plugin';
import { ErpReconciliationDashboardPlugin } from './erp-reconciliation-dashboard.plugin';
import { OrganizationsDashboardPlugin } from './organizations-dashboard.plugin';

const instanceType = (process.env.INSTANCE_TYPE ?? 'branch') as 'central' | 'branch';
const redisDb = parseInt(process.env.REDIS_DB ?? '0');
const integrationKafkaEnabled = process.env.INTEGRATION_KAFKA_ENABLED === 'true';
// Issue #68 contour model: the legacy direct-REST ERP intake and the real Kafka/Integration
// Service path are mutually exclusive per contour — set explicitly per env file (true for
// local/branch dev, false for staging-integration/production), same shape as
// INTEGRATION_KAFKA_ENABLED above.
const erpImportEnabled = process.env.ERP_IMPORT_ENABLED !== 'false';

// Issue #68 follow-up: a bare `?? 'mivend-central-hub-local'` fallback would silently apply the
// *local* contour's Kafka identity to staging-integration/production too if one of these env vars
// is ever left unset there — exactly the kind of silent cross-contour identity collision this
// suffixing exists to prevent. Once Kafka is actually enabled, every id must be explicit; only the
// disabled (local) case gets a safe default.
function requiredKafkaId(envVar: string): string {
    const value = process.env[envVar];
    if (value) return value;
    if (integrationKafkaEnabled) {
        throw new Error(
            `${envVar} must be set explicitly when INTEGRATION_KAFKA_ENABLED=true — there is no ` +
                "safe per-contour default (see docs/environments.md's Kafka clientId/groupId naming section).",
        );
    }
    return 'mivend-central-hub-local';
}

// Only central talks to the ERP/payment providers (the external-integration-rules skill)
const instancePlugins = instanceType === 'central' ? [AcquiringPlugin.init({})] : [];

// Issue #121: devMode writes real emails (real token/link, same code path as production) to
// disk and serves them at /mailbox instead of sending. Deliberately NOT gated on
// NODE_ENV !== 'production' (unlike dbConnectionOptions.synchronize above, which genuinely must
// stay production-only — auto schema sync against a real DB is dangerous in a way an unsent
// email is not): the SMTP-relay vs. transactional-email-API decision (#121) is still open, and
// production always sets NODE_ENV=production (Dockerfile/docker-compose.yml) regardless of
// whether that decision has landed yet — tying devMode to NODE_ENV would mean password-
// reset/account-activation links (#119/#120) simply vanish in production until #121's provider
// is chosen. Instead: devMode is on whenever no real transport has been configured at all
// (EMAIL_TRANSPORT unset), independent of contour — so the mailbox stays reachable in production
// too until a real provider is wired in via EMAIL_TRANSPORT.
const emailTransportConfigured = Boolean(process.env.EMAIL_TRANSPORT);
const emailDevMode = !emailTransportConfigured;

const emailPlugin = EmailPlugin.init(
    emailDevMode
        ? {
              devMode: true,
              outputPath: path.join(__dirname, '../static/email/test-mailbox'),
              route: 'mailbox',
              templateLoader: new FileBasedTemplateLoader(
                  path.join(__dirname, '../static/email/templates'),
              ),
              handlers: [emailVerificationHandler, passwordResetHandler, emailAddressChangeHandler],
          }
        : // EMAIL_TRANSPORT is set, but no real transport (SMTP relay vs. transactional-email
          // API — #121) is implemented yet. This only throws when someone explicitly opts in by
          // setting EMAIL_TRANSPORT, never on an ordinary boot, so it doesn't reintroduce the
          // "unrelated deploy crashes over an email decision" problem devMode's own gate avoids.
          ((): never => {
              throw new Error(
                  `EMAIL_TRANSPORT=${process.env.EMAIL_TRANSPORT} was set, but no real ` +
                      'EmailTransportOptions is implemented yet — see issue #121 (the SMTP-relay ' +
                      'vs. transactional-email-API decision is still open). Implement the chosen ' +
                      'transport here, or unset EMAIL_TRANSPORT to keep using devMode.',
              );
          })(),
);

export const config: VendureConfig = {
    apiOptions: {
        port: parseInt(process.env.PORT ?? '3000'),
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
            password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
        },
        customPermissions: Object.values(CustomPermission),
    },
    dbConnectionOptions: {
        type: 'postgres',
        synchronize: process.env.NODE_ENV !== 'production',
        logging: false,
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432'),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'mivend',
    },
    customFields: {
        TaxCategory: [
            {
                // Stable ERP-side code (see 1C's Catalog_Номенклатура.СтавкаНДС enum) that
                // packages/plugins/erp-integration's product handler resolves against — never
                // matched by `name`, which is free text an admin can rename/localize at will.
                // See issue #79.
                name: 'erpVatCode',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP VAT Code' }],
            },
        ],
        Order: [
            {
                name: 'erpOrderId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Order ID' }],
            },
            {
                name: 'erpStatus',
                type: 'string',
                nullable: true,
                defaultValue: 'PENDING',
                label: [{ languageCode: LanguageCode.en, value: 'ERP Status' }],
            },
            {
                name: 'erpStatusAt',
                type: 'datetime',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Status Updated At' }],
            },
            {
                // Denormalized at OrderPlacedEvent time from the customer's preferred
                // TradingPoint (see ErpOrderService.onOrderPlaced) — same pattern as
                // Reservation.stockLocationId, filtering without a join. See
                // docs/access-control.md "Branch scope is a separate axis".
                name: 'tradingPointId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Trading Point' }],
            },
            {
                name: 'branchId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Servicing Branch' }],
            },
            {
                // Correlates a synced order's local copy with its origin instance's native
                // Order id — set only on the RECEIVING side (the instance this order was
                // replicated onto), never on the originating instance itself. See
                // docs/architecture.md's "receiving instance gets a full local Order copy".
                name: 'sourceOrderId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Source Order ID' }],
            },
            {
                // Informational projection of a `payment.recorded` sync fact — set only on an
                // instance that does NOT own this order (a replica); the owning instance's real
                // payment status lives on its actual `Payment` records instead. See
                // docs/architecture.md's "Order as a read-model: independent event streams per
                // concern (CQRS)".
                name: 'paymentStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Payment Status (synced)' }],
            },
            {
                // Denormalized from the order's own Fulfillments (most recently created one's
                // state) whenever a Fulfillment is added or transitions — see
                // ErpOrderService.onFulfillmentStateChanged. Exists so the manager portal's
                // Orders tables can sort/filter by fulfillment status server-side instead of
                // fetching every order's fulfillments relation and computing this per-request on
                // the frontend (real incident this fixes — see CustomerOrdersTab.vue's git
                // history: fulfillment status/placed-by were being derived client-side from
                // nested relations on every page load, un-filterable/un-sortable as a result).
                // Null means "no fulfillment yet" (same as the frontend's previous "Not started"
                // fallback).
                name: 'latestFulfillmentState',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Latest Fulfillment State' }],
            },
            {
                // The Administrator who placed this order via the manager portal, denormalized
                // once at the same AddingItems/Draft → * transition as branchId/tradingPointId
                // (see ErpOrderService.onOrderPlaced) — null when a storefront customer placed
                // it themselves. Same reasoning as latestFulfillmentState: makes "Placed by"
                // sortable/filterable server-side instead of derived from the order's first
                // HistoryEntry on every request.
                name: 'placedByAdministratorId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Placed By (Administrator)' }],
            },
            {
                // 1C's own document number for this order's registration (Document.Номер) — set
                // from company.orders.events.v1.OrderRegistrationResult.document_number, a real
                // proto `optional string` (genuinely absent, not a zero-value-omission case).
                // Staff need this to cross-reference the order against 1C directly. See #74's
                // order-registration-result follow-up.
                name: 'erpRegistrationDocumentNumber',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Registration Document #' }],
            },
            {
                // Raw `status` string from the same event — 1C's own label, passed through
                // verbatim, never mapped to a mivend enum (no fixed value set is documented by
                // Integration Service yet). Empty string means the field was absent (plain,
                // non-optional proto3 string — zero-value-omission rule applies, not `optional`).
                name: 'erpRegistrationStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Registration Status' }],
            },
            {
                // Raw `status` string from company.orders.events.v1.order-changed (issue #110) —
                // this stream's own current-state view, fired repeatedly over the order's
                // lifetime, distinct from erpRegistrationStatus (order-registration-result's
                // one-shot registration outcome, a different 1C fact with its own timing). Kept
                // as a separate field rather than reused, since order-changed can report a
                // different value/timing than the one-time registration result and overwriting
                // that field would lose the registration-time fact. Passed through verbatim,
                // never mapped to a mivend enum. Empty string means the field was absent (plain,
                // non-optional proto3 string — zero-value-omission rule).
                name: 'erpOrderStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Order Status' }],
            },
            {
                // Flat GUID ref to a 1C "Договор" (contract) — OrderChanged.contract_id (issue
                // #110/#123), a real proto `optional string` (genuinely absent, not a zero-value-
                // omission case). Purely informational for now: no Contract entity exists yet in
                // this repo, this just persists the source system's own identifier (see the
                // external-integration-rules skill's "External reference id" rule) for #50/#105's
                // future per-contract credit-limit attribution once that entity exists.
                name: 'erpContractId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Contract ID' }],
            },
        ],
        Product: [
            {
                name: 'externalId',
                type: 'string',
                nullable: true,
                unique: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP External ID' }],
            },
            {
                name: 'onSale',
                type: 'boolean',
                defaultValue: false,
                label: [{ languageCode: LanguageCode.en, value: 'On Sale' }],
            },
            // Issue #116 — ProductChanged's `manufacturer` field is a 1C directory GUID, not a
            // display name (confirmed live with Search Platform — the field's own OpenAPI
            // description is misleading). A relation to the real Manufacturer entity, not a
            // plain string field; ProductStreamHandler resolves/creates the Manufacturer and
            // backfills its name from the 'attributes' map's own 'Производитель' key.
            {
                name: 'manufacturer',
                type: 'relation',
                entity: Manufacturer,
                graphQLType: 'Manufacturer',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manufacturer' }],
            },
        ],
        ProductVariant: [
            {
                name: 'weight',
                type: 'float',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Weight (kg)' }],
            },
            {
                // Which of our own legal entities (OrganizationRequisites, plugin-documents)
                // owns the stock this variant is fulfilled from — driven by 1C's warehouse
                // storage-location assignment (one storage location = one product = one
                // organization). See docs/payments.md "Organizations".
                name: 'organizationId',
                type: 'int',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Organization' }],
            },
            {
                // The priority of the StorageLocationChanged row that last set organizationId
                // above — a product can have several storage-location rows (issue #71), each its
                // own Kafka entity with its own independent version history, so the inbox's
                // per-entityId ordering guard doesn't by itself pick a winner across them. Lowest
                // priority wins (see StorageLocationStreamHandler); storing it here lets a later
                // arrival compare against the current winner instead of last-message-wins.
                name: 'organizationPriority',
                type: 'int',
                nullable: true,
                public: false,
                label: [
                    { languageCode: LanguageCode.en, value: 'Organization assignment priority' },
                ],
            },
            {
                // The StorageLocationChanged entityId (storage_location_id) that currently owns
                // organizationId/organizationPriority above. Needed for two things a bare priority
                // number can't do alone: (1) a deterministic tiebreak when two different
                // storage-location rows arrive with equal priority, and (2) recognizing a delete
                // of the CURRENT winner so it can be cleared instead of staying permanently
                // pinned to a now-deleted row (mivend.audit.71 findings).
                name: 'organizationSourceEntityId',
                type: 'string',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Organization assignment source' }],
            },
        ],
        StockLocation: [
            {
                // Idempotency key for erp-integration's WarehouseStreamHandler: correlates this
                // StockLocation with the Warehouse it was created for (Warehouse.erpId, the
                // warehouse's own 1C GUID) — StockLocation has no native external-id field.
                name: 'warehouseErpId',
                type: 'string',
                nullable: true,
                unique: true,
                label: [{ languageCode: LanguageCode.en, value: 'Warehouse ERP ID' }],
            },
        ],
        StockLevel: [
            {
                // 1C's own availableQuantity for this (productVariant, stockLocation) — from
                // StockChanged (issue #72). Caps ReservationAvailabilityService's own ATP
                // formula: 1C receives reservations from other channels that never reach mivend
                // as events, so mivend's own local ledger alone cannot be trusted as the ceiling.
                // Previously decoded and discarded entirely — see StockStreamHandler.
                name: 'erpAvailableQuantity',
                type: 'int',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'ERP available quantity' }],
            },
        ],
        Collection: [
            {
                // Issue #90: manual visibility decision that must survive the next Kafka
                // isActive/isDeleted recompute (CategoryStreamHandler.ensureCollection reads
                // this before applying the feed). Null = no override, feed drives isPrivate as
                // before. A nullable boolean would render as an unreadable three-way checkbox in
                // Vendure's auto-generated custom-field admin form, so this is a string enum
                // instead (Auto/Hidden/Visible).
                name: 'visibilityOverride',
                type: 'string',
                nullable: true,
                options: [
                    {
                        value: 'hidden',
                        label: [{ languageCode: LanguageCode.en, value: 'Hidden' }],
                    },
                    {
                        value: 'visible',
                        label: [{ languageCode: LanguageCode.en, value: 'Visible' }],
                    },
                ],
                label: [{ languageCode: LanguageCode.en, value: 'Visibility Override' }],
            },
        ],
        GlobalSettings: [
            {
                // Admin-controlled toggle (Settings screen in Admin UI — customFields on
                // GlobalSettings show up there automatically) for docs/payments.md
                // "Organizations": once enabled, every product/variant MUST carry
                // organizationId (erp-import rejects records without one) and online payment
                // MUST compute a real per-organization split (no silent single-payment
                // fallback) — see ProductHandler and payment-method-handlers.ts.
                name: 'organizationSplitEnabled',
                type: 'boolean',
                defaultValue: true,
                label: [{ languageCode: LanguageCode.en, value: 'Split sales by organization' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value:
                            'When enabled, every product must be assigned to one of our own ' +
                            'legal entities (organization), and online payment splits into ' +
                            'one invoice per organization before charging the customer.',
                    },
                ],
            },
        ],
    },
    orderOptions: {
        orderCodeStrategy: new DateStampedOrderCodeStrategy(),
        orderItemPriceCalculationStrategy: new CustomerPriceCalculationStrategy(),
    },
    catalogOptions: {
        // Not MultiChannelStockLocationStrategy — a branch here is a soft staff-grouping tag,
        // not a Channel-shaped catalog/pricing partition (see BranchStockLocationStrategy's own
        // comment and issue #63's confirmed architecture decision).
        stockLocationStrategy: new BranchStockLocationStrategy(),
    },
    paymentOptions: {
        paymentMethodHandlers: [offlineTermsPaymentHandler, onlineStubPaymentHandler],
    },
    plugins: [
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // Root-relative by default (not an absolute http://host:port URL) so
            // asset links resolve against whatever origin the browser is actually
            // on. The alternative — Vendure's default behind-a-proxy detection via
            // the request's Host header — breaks when the storefront's dev proxy
            // (or any reverse proxy) rewrites Host to the backend's internal
            // address (e.g. Vite's `changeOrigin: true` on /shop-api), baking a
            // non-public hostname (localhost:3000) into every asset URL. Requires
            // /assets to be proxied to this server under the same public origin
            // the storefront is served from (see storefront/vite.config.ts).
            assetUrlPrefix: process.env.ASSET_URL_PREFIX ?? '/assets/',
        }),
        emailPlugin,
        BullMQJobQueuePlugin.init({
            connection: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
                maxRetriesPerRequest: null,
            },
        }),
        // Issue #80: the standard for all recurring/periodic plugin work (sweeps, cleanups,
        // polling) — see the backend-plugin-rules skill's "Recurring/periodic work" section.
        // Runs worker-process-only and DB-locked out of the box (DefaultSchedulerStrategy), and
        // gives enable/disable + run-now via the admin API without any custom code.
        DefaultSchedulerPlugin.init({}),
        // No .init() — the dashboard is served as its own standalone app (packages/dashboard),
        // not mounted here. This plugin is only registered to expose the `metricSummary` GraphQL
        // query the dashboard's Insights page needs, per @vendure/dashboard's own documented
        // standalone-deployment pattern.
        DashboardPlugin,
        // Issue #76 follow-up, unblocked by #77: surfaces the same 6-item system-config
        // checklist as packages/manager's Settings → System health page, but as a
        // @vendure/dashboard alert (see src/dashboard/system-health/index.ts) — the first login
        // on a fresh instance (native `superadmin`, no manager-portal accounts yet) happens
        // here, not in the manager portal.
        //
        // Not a packages/plugins/* package despite backend-plugin-rules' usual "one package per
        // plugin" convention: this plugin has zero business logic (no entities/resolvers/
        // services), and @vendure/dashboard's static plugin-discovery step (which globs
        // node_modules for a compiled `dashboard: '...'` decorator property) cannot see a
        // pnpm-workspace-symlinked package's dashboard extension at all — it classifies any
        // symlinked local package as a "local plugin" and only ever registers its dashboard
        // extension when that plugin's *compiled* JS also lands inside the dashboard's own
        // introspection temp dir, which only happens for files reachable via a genuine relative
        // import from vendure-config.ts. Verified directly (fast-glob probes + a manual acorn
        // AST-walk against the compiled output) while debugging why the alert never appeared
        // (`Analyzed plugins and found 0 dashboard extensions`) — see the alert file's own
        // comment for the confirmed detection mechanism this relies on instead.
        SystemHealthDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin just above (issue #76's own
        // pnpm-workspace-symlink discovery limitation) — see
        // src/dashboard/default-superadmin-account/index.ts.
        DefaultSuperadminAlertDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin above — see
        // src/dashboard/branch-consolidation/index.ts.
        BranchConsolidationAlertDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin above (issue #91) — Kafka lag and
        // inbox backlog together, as two sections of one page — see
        // src/dashboard/integration-health/index.ts.
        IntegrationHealthDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin above (issue #97) — its own page
        // rather than a third section on integration-health, since that page is already dense —
        // see src/dashboard/erp-reconciliation/index.ts.
        ErpReconciliationDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin above (issue #88) — native
        // Dashboard companion to packages/manager's Settings → Organizations page, same
        // read-only organizationRequisites query — see src/dashboard/organizations/index.ts.
        OrganizationsDashboardPlugin,
        CustomerPricingPlugin.init({ defaultPriceTypeCode: 'RETAIL' }),
        AccessControlPlugin,
        SessionManagementPlugin.init({}),
        ApprovalWorkflowPlugin,
        VersioningPlugin,
        CounterpartyPlugin,
        PriceEntryPlugin,
        DocumentsPlugin,
        ...(erpImportEnabled ? [ErpImportPlugin] : []),
        CrossReferencePlugin,
        ...searchPlugins,
        ErpOrderPlugin,
        PopularProductsPlugin,
        SyncPlugin.init({
            instanceType,
            instanceId: process.env.INSTANCE_ID ?? 'central',
            rabbitmq: {
                url: process.env.RABBITMQ_URL ?? 'amqp://mivend:mivend@localhost:5672',
            },
            erpAdapter: new StubErpAdapter(),
        }),
        ErpIntegrationPlugin.init({
            instanceType,
            // Issue #68: separate axis from instanceType — a real Integration Service broker
            // connection must be explicitly opted into per contour (local/staging-integration/prod), never
            // implied by instanceType === 'central' alone. See docs/environments.md.
            kafkaEnabled: integrationKafkaEnabled,
            kafka: {
                brokers: (process.env.INTEGRATION_KAFKA_BROKERS ?? 'localhost:9094').split(','),
                clientId: requiredKafkaId('INTEGRATION_KAFKA_CLIENT_ID'),
                ssl: process.env.INTEGRATION_KAFKA_CA_PATH
                    ? {
                          ca: [
                              readFileSync(
                                  path.resolve(__dirname, process.env.INTEGRATION_KAFKA_CA_PATH),
                                  'utf-8',
                              ),
                          ],
                      }
                    : undefined,
                sasl:
                    process.env.INTEGRATION_KAFKA_SASL_USERNAME &&
                    process.env.INTEGRATION_KAFKA_SASL_PASSWORD
                        ? {
                              mechanism: 'scram-sha-512',
                              username: process.env.INTEGRATION_KAFKA_SASL_USERNAME,
                              password: process.env.INTEGRATION_KAFKA_SASL_PASSWORD,
                          }
                        : undefined,
                topic:
                    process.env.INTEGRATION_KAFKA_TOPIC ??
                    'mivend.orders.events.v1.order-submitted',
            },
            kafkaConsumer: {
                brokers: (process.env.INTEGRATION_KAFKA_BROKERS ?? 'localhost:9094').split(','),
                clientId: requiredKafkaId('INTEGRATION_KAFKA_CONSUMER_CLIENT_ID'),
                groupId: requiredKafkaId('INTEGRATION_KAFKA_CONSUMER_GROUP_ID'),
                ssl: process.env.INTEGRATION_KAFKA_CA_PATH
                    ? {
                          ca: [
                              readFileSync(
                                  path.resolve(__dirname, process.env.INTEGRATION_KAFKA_CA_PATH),
                                  'utf-8',
                              ),
                          ],
                      }
                    : undefined,
                sasl:
                    process.env.INTEGRATION_KAFKA_SASL_USERNAME &&
                    process.env.INTEGRATION_KAFKA_SASL_PASSWORD
                        ? {
                              mechanism: 'scram-sha-512',
                              username: process.env.INTEGRATION_KAFKA_SASL_USERNAME,
                              password: process.env.INTEGRATION_KAFKA_SASL_PASSWORD,
                          }
                        : undefined,
                // Real topic names, verified against Integration Service's own producer
                // (outbox-event-mapper.ts) and search-service's own consumer
                // (indexing.constants.ts's KAFKA_TOPIC_PREFIX/topicForStream): always
                // "company.catalog.events.v1.<kebab-stream>-changed" — see
                // docs/ai/1c-integration-service-decision.md's 2026-08-14 retraction.
                topics: {
                    category:
                        process.env.INTEGRATION_KAFKA_TOPIC_CATEGORY ??
                        'company.catalog.events.v1.category-changed',
                    organization:
                        process.env.INTEGRATION_KAFKA_TOPIC_ORGANIZATION ??
                        'company.catalog.events.v1.organization-changed',
                    warehouse:
                        process.env.INTEGRATION_KAFKA_TOPIC_WAREHOUSE ??
                        'company.catalog.events.v1.warehouse-changed',
                    'price-type':
                        process.env.INTEGRATION_KAFKA_TOPIC_PRICE_TYPE ??
                        'company.catalog.events.v1.price-type-changed',
                    product:
                        process.env.INTEGRATION_KAFKA_TOPIC_PRODUCT ??
                        'company.catalog.events.v1.product-changed',
                    offer:
                        process.env.INTEGRATION_KAFKA_TOPIC_OFFER ??
                        'company.catalog.events.v1.offer-changed',
                    price:
                        process.env.INTEGRATION_KAFKA_TOPIC_PRICE ??
                        'company.catalog.events.v1.price-changed',
                    stock:
                        process.env.INTEGRATION_KAFKA_TOPIC_STOCK ??
                        'company.catalog.events.v1.stock-changed',
                    // Issue #71: product+warehouse+organization storage-location assignment
                    // (1C's МестаХраненияНоменклатуры register) — the real source for
                    // ProductVariant.customFields.organizationId, see StorageLocationStreamHandler.
                    'storage-location':
                        process.env.INTEGRATION_KAFKA_TOPIC_STORAGE_LOCATION ??
                        'company.catalog.events.v1.storage-location-changed',
                    // Organization-level stock split (1C's ТоварыОрганизаций register) — quantity
                    // dimension deliberately deferred to issue #72, not a second organizationId
                    // source (StorageLocationChanged is sole source of truth for that).
                    'stock-organization':
                        process.env.INTEGRATION_KAFKA_TOPIC_STOCK_ORGANIZATION ??
                        'company.catalog.events.v1.stock-organization-changed',
                    // Issue #75: 1C's own, same-transaction confirmation that an order document
                    // was posted and stock written off — the real reservation-release trigger.
                    // Different domain from the 8 catalog streams above (company.orders, not
                    // company.catalog) — see OrderRegistrationResultHandler/
                    // ReservationWriteOffSyncService.
                    'order-registration-result':
                        process.env.INTEGRATION_KAFKA_TOPIC_ORDER_REGISTRATION_RESULT ??
                        'company.orders.events.v1.order-registration-result',
                    // Issue #110/#72: the order's ongoing current-state view (status,
                    // reservedQuantity, contractId), fired repeatedly over the order's lifetime —
                    // distinct from order-registration-result's one-shot registration outcome. See
                    // OrderChangedStreamHandler/ReservationWriteOffSyncService.handleOrderChanged.
                    'order-changed':
                        process.env.INTEGRATION_KAFKA_TOPIC_ORDER_CHANGED ??
                        'company.orders.events.v1.order-changed',
                    // 1C's "Подразделение" — feeds the Department entity in
                    // @mivend/plugin-access-control. Different domain (company.customers) than
                    // the catalog/orders streams above — see DepartmentStreamHandler.
                    department:
                        process.env.INTEGRATION_KAFKA_TOPIC_DEPARTMENT ??
                        'company.customers.events.v1.department-changed',
                    // 1C's counterparty ("Контрагент") — feeds the Counterparty entity in
                    // @mivend/plugin-counterparty. Same domain (company.customers) as department
                    // above — see CounterpartyStreamHandler (issue #104).
                    counterparty:
                        process.env.INTEGRATION_KAFKA_TOPIC_COUNTERPARTY ??
                        'company.customers.events.v1.counterparty-changed',
                    // search-platform#129: register-driven creditBalance, independent of
                    // counterparty above — see CounterpartyCreditBalanceStreamHandler.
                    'counterparty-credit-balance':
                        process.env.INTEGRATION_KAFKA_TOPIC_COUNTERPARTY_CREDIT_BALANCE ??
                        'company.customers.events.v1.counterparty-credit-balance-changed',
                    // Issue #109: Administrator enrichment (erpId/departmentId), also the
                    // resolution target for CounterpartyChanged's manager_id/manager_ids.
                    user:
                        process.env.INTEGRATION_KAFKA_TOPIC_USER ??
                        'company.customers.events.v1.user-changed',
                    // Issue #107: per-product gift/percent promo rules, same company.customers
                    // domain as department/counterparty/user above — see PromoRuleStreamHandler.
                    'promo-rule':
                        process.env.INTEGRATION_KAFKA_TOPIC_PROMO_RULE ??
                        'company.customers.events.v1.promo-rule-changed',
                },
            },
            schemaRegistry: {
                url: process.env.INTEGRATION_SCHEMA_REGISTRY_URL ?? 'http://localhost:8081',
            },
            // Issue #84: reconciliation summary API — separate REST boundary from the Kafka
            // streams above, same host/API key family as Integration Service's Ingestion API.
            reconciliationApiUrl:
                process.env.INTEGRATION_SERVICE_BASE_URL ?? 'https://is.komponent-m.ru',
            reconciliationApiKey: process.env.INTEGRATION_SERVICE_API_KEY ?? '',
        }),
        ReservationPlugin.init({}),
        NotificationPlugin,
        MoqPlugin,
        SavedViewsPlugin,
        ...instancePlugins,
    ],
};
// force restart 1784646839
// force restart 1784647603
// force restart 1784648415
// force restart 1784652831
// force restart2 1784652875
// force restart3 1784653316
// hard restart 1784653421
