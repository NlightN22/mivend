import path from 'path';
import { readFileSync } from 'fs';
import { LanguageCode, VendureConfig } from '@vendure/core';
import { DateStampedOrderCodeStrategy } from './order-code.strategy';
import { CustomerPriceCalculationStrategy } from './customer-price-calculation.strategy';
import { offlineTermsPaymentHandler, onlineStubPaymentHandler } from './payment-method-handlers';
import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { BullMQJobQueuePlugin } from '@vendure/job-queue-plugin/package/bullmq';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { ErpImportPlugin } from '@mivend/plugin-erp-import';
import { CrossReferencePlugin } from '@mivend/plugin-cross-reference';
import { searchPlugins } from '@mivend/plugin-search';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { SyncPlugin, StubErpAdapter } from '@mivend/plugin-sync';
import { ErpIntegrationPlugin, BranchStockLocationStrategy } from '@mivend/plugin-erp-integration';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { PopularProductsPlugin } from '@mivend/plugin-popular-products';
import { AccessControlPlugin, CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { ReservationPlugin } from '@mivend/plugin-reservation';
import { MoqPlugin } from '@mivend/plugin-moq';
import { VersioningPlugin } from '@mivend/plugin-versioning';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import { AcquiringPlugin } from '@mivend/plugin-acquiring';
import { SavedViewsPlugin } from '@mivend/plugin-saved-views';

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
const instancePlugins =
    instanceType === 'central'
        ? [
              AcquiringPlugin.init({
                  redis: {
                      host: process.env.REDIS_HOST ?? 'localhost',
                      port: parseInt(process.env.REDIS_PORT ?? '6379'),
                      db: redisDb,
                  },
              }),
          ]
        : [];

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
        BullMQJobQueuePlugin.init({
            connection: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
                maxRetriesPerRequest: null,
            },
        }),
        AdminUiPlugin.init({
            route: 'admin',
            port: parseInt(process.env.ADMIN_UI_PORT ?? '3002'),
            adminUiConfig: {
                defaultLanguage: LanguageCode.ru,
                availableLanguages: [LanguageCode.en, LanguageCode.ru],
            },
        }),
        CustomerPricingPlugin.init({ defaultPriceTypeCode: 'RETAIL' }),
        AccessControlPlugin,
        SessionManagementPlugin.init({
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
            },
        }),
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
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
            },
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
                },
            },
            schemaRegistry: {
                url: process.env.INTEGRATION_SCHEMA_REGISTRY_URL ?? 'http://localhost:8081',
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
            },
        }),
        ReservationPlugin.init({
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379'),
                db: redisDb,
            },
        }),
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
