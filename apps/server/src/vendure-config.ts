import path from 'path';
import { readFileSync } from 'fs';
import {
    DefaultJobQueuePlugin,
    DefaultPasswordValidationStrategy,
    DefaultSchedulerPlugin,
    LanguageCode,
    VendureConfig,
} from '@vendure/core';
import { NumberingOrderCodeStrategy } from './order-code.strategy';
import { sessionOptionsFromEnv } from './session-options';
import { OrderUuidSubscriber } from './order-uuid.subscriber';
import { CustomerPriceCalculationStrategy } from './customer-price-calculation.strategy';
import { DeferredPaymentPlugin } from '@mivend/plugin-deferred-payment';
import { FreightShippingPlugin } from '@mivend/plugin-freight-shipping';
import { PickupShippingPlugin } from '@mivend/plugin-pickup-shipping';
import { OnlinePaymentPlugin, onlineStubPaymentHandler } from '@mivend/plugin-online-payment';
import { AssetServerPlugin, configureS3AssetStorage } from '@vendure/asset-server-plugin';
import {
    EmailPlugin,
    FileBasedTemplateLoader,
    emailVerificationHandler,
    passwordResetHandler,
    emailAddressChangeHandler,
} from '@vendure/email-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { RetroBonusPlugin } from '@mivend/plugin-retro-bonus';
import { SettlementPlugin } from '@mivend/plugin-settlement';
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
import { NumberingPlugin } from '@mivend/plugin-numbering';
import { OrderIdentityPlugin } from '@mivend/plugin-order-identity';
import { VersioningPlugin } from '@mivend/plugin-versioning';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import {
    AcquiringPlugin,
    cashPaymentHandler,
    offlineTermsPaymentHandler,
} from '@mivend/plugin-acquiring';
import { SavedViewsPlugin } from '@mivend/plugin-saved-views';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { SystemHealthDashboardPlugin } from './system-health-dashboard.plugin';
import { DefaultSuperadminAlertDashboardPlugin } from './default-superadmin-alert-dashboard.plugin';
import { BranchConsolidationAlertDashboardPlugin } from './branch-consolidation-alert-dashboard.plugin';
import { IntegrationHealthDashboardPlugin } from './integration-health-dashboard.plugin';
import { ErpReconciliationDashboardPlugin } from './erp-reconciliation-dashboard.plugin';
import { OrganizationsDashboardPlugin } from './organizations-dashboard.plugin';
import { ErpUsersDashboardPlugin } from './erp-users-dashboard.plugin';
import { ProductPhotosDashboardPlugin } from './product-photos-dashboard.plugin';
import { CounterpartyDashboardPlugin } from './counterparty-dashboard.plugin';
import { RoleProvisioningDashboardPlugin } from './role-provisioning-dashboard.plugin';

const instanceType = (process.env.INSTANCE_TYPE ?? 'branch') as 'central' | 'branch';
const instanceNumberCode = process.env.INSTANCE_NUMBER_CODE ?? '';
const defaultPriceTypeCode = process.env.DEFAULT_PRICE_TYPE_CODE ?? 'RETAIL';
const defaultCurrencyCode = process.env.DEFAULT_CURRENCY_CODE ?? 'RUB';
const branchNames = (process.env.BOOTSTRAP_BRANCH_NAMES ?? 'Main')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
const integrationKafkaEnabled = process.env.INTEGRATION_KAFKA_ENABLED === 'true';
const orderEventsTopic = process.env.INTEGRATION_KAFKA_TOPIC_ORDER_EVENTS ?? 'erp.order.events.v1';
// Issue #68 contour model: the legacy direct-REST ERP intake and the real Kafka/Integration
// Service path are mutually exclusive per contour. Closed by default: only exactly 'true' mounts it.
const erpImportEnabled = process.env.ERP_IMPORT_ENABLED === 'true';

// A bare fallback would silently apply the local contour's Kafka identity to other contours
// Once Kafka is enabled every id must be explicit; only the disabled (local) case may default.
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

const cookieSecret =
    (process.env.COOKIE_SECRET || undefined) ??
    (process.env.NODE_ENV === 'production' ? undefined : 'mivend-dev-cookie-secret');
if (
    !cookieSecret ||
    (process.env.NODE_ENV === 'production' && cookieSecret.startsWith('change-me'))
) {
    throw new Error('COOKIE_SECRET must be a real secret in production (same for every process)');
}

// AcquiringPlugin already runs on every instance via DocumentsPlugin's module import.
// Unconditional .init({}) keeps AcquiringPluginOptions defined even where the array omits it.
const instancePlugins = [AcquiringPlugin.init({})];

// Issue #121: until a real transport exists, emails (real token/link) are written to disk instead
// of sent. The HTTP /mailbox route exposes those tokens, so it exists only with the explicit flag.
const sessionOptions = sessionOptionsFromEnv(process.env);
const emailDevMailboxEnabled = process.env.EMAIL_DEV_MAILBOX_ENABLED === 'true';
const emailTransportConfigured = Boolean(process.env.EMAIL_TRANSPORT);
const emailOutputPath = path.join(__dirname, '../static/email/test-mailbox');

// Vendure core cannot know the manager portal's public URL, so it comes from a per-contour env var.
// Unset yields a host-less link, not a boot failure: a missing var must not take the server down.
const managerPublicUrl = process.env.MANAGER_PUBLIC_URL ?? '';

const emailCommonOptions = {
    templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
    handlers: [emailVerificationHandler, passwordResetHandler, emailAddressChangeHandler],
    globalTemplateVars: {
        fromAddress: '"mivend" <noreply@example.com>',
        passwordResetUrl: `${managerPublicUrl}/set-password`,
    },
};

if (emailTransportConfigured) {
    // Fails only on explicit opt-in, so an unrelated deploy never crashes over an email decision.
    throw new Error(
        `EMAIL_TRANSPORT=${process.env.EMAIL_TRANSPORT} was set, but no real EmailTransportOptions ` +
            'is implemented yet — see issue #121. Unset EMAIL_TRANSPORT to keep the file transport.',
    );
}

const emailPlugin = EmailPlugin.init(
    emailDevMailboxEnabled
        ? { ...emailCommonOptions, devMode: true, outputPath: emailOutputPath, route: 'mailbox' }
        : { ...emailCommonOptions, transport: { type: 'file', outputPath: emailOutputPath } },
);

export const config: VendureConfig = {
    apiOptions: {
        port: parseInt(process.env.PORT ?? '3000'),
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
    },
    importExportOptions: {
        importAssetsDir: path.join(__dirname, '../../../infrastructure/fixtures/category-icons'),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        // Vendure's default secret is random per process start, which logs everyone out on every restart.
        cookieOptions: { secret: cookieSecret },
        sessionDuration: sessionOptions.sessionDuration,
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
            password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
        },
        customPermissions: Object.values(CustomPermission),
        // Enforces the 8-char minimum promised on the set-password page; Vendure's default is 4.
        // No complexity rules: that page promises only a length floor, so don't demand more.
        passwordValidationStrategy: new DefaultPasswordValidationStrategy({ minLength: 8 }),
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
        // Production-only (synchronize:false there) — see docs/environments.md's "Migrations".
        migrations: [path.join(__dirname, 'migrations/*.+(js|ts)')],
        subscribers: [OrderUuidSubscriber],
        // An exhausted pool fails the waiting request after the timeout instead of freezing the server (#257).
        extra: {
            max: parseInt(process.env.DB_POOL_SIZE ?? '10'),
            connectionTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS ?? '15000'),
        },
    },
    customFields: {
        TaxCategory: [
            {
                // Matched by stable ERP code, never by name: names are free text an admin can rename.
                name: 'erpVatCode',
                type: 'string',
                nullable: true,
                unique: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP VAT Code' }],
            },
        ],
        Order: [
            {
                // Immutable identity for idempotency/exchange — see docs/identifiers.md. Assigned
                // synchronously at insert by OrderUuidSubscriber, never left null after creation.
                name: 'uuid',
                type: 'string',
                nullable: true,
                unique: true,
                label: [{ languageCode: LanguageCode.en, value: 'UUID' }],
            },
            {
                name: 'erpOrderId',
                type: 'string',
                nullable: true,
                unique: true,
                public: false,
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
                // Denormalized at order placement so branch filtering needs no join (see Reservation.stockLocationId).
                name: 'tradingPointId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Trading Point' }],
            },
            {
                // Address of tradingPointId copied at placement, so a later point edit cannot change a submitted order.
                name: 'deliveryAddress',
                type: 'text',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Delivery Address' }],
            },
            {
                name: 'branchId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Servicing Branch' }],
            },
            {
                // Native Order id of the origin instance; set only on the receiving side, never on the origin.
                name: 'sourceOrderId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Source Order ID' }],
            },
            {
                // Projection of payment.recorded on replicas only; the owning instance uses its real Payment records.
                name: 'paymentStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Payment Status (synced)' }],
            },
            {
                // Denormalized so Orders tables can sort/filter by fulfillment status server-side, not per request.
                // Null means no fulfillment yet. Kept in sync on every Fulfillment add or state transition.
                name: 'latestFulfillmentState',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Latest Fulfillment State' }],
            },
            {
                // Null when a storefront customer placed the order; denormalized so it sorts server-side.
                name: 'placedByAdministratorId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Placed By (Administrator)' }],
            },
            {
                // Proto `optional` field: absent means genuinely no ERP document number, not an empty value.
                name: 'erpRegistrationDocumentNumber',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Registration Document #' }],
            },
            {
                // Passed through verbatim, never mapped to an enum: no fixed value set is documented yet.
                // Empty string means absent: plain proto3 string, so zero-value omission applies.
                name: 'erpRegistrationStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Registration Status' }],
            },
            {
                // Separate from erpRegistrationStatus, which must keep the one-time registration fact.
                // Passed through verbatim, never mapped to an enum. Empty string means absent (zero-value omission).
                name: 'erpOrderStatus',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Order Status' }],
            },
            {
                // Informational only until a Contract entity exists; holds the ERP's own id for later use.
                name: 'erpContractId',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Contract ID' }],
            },
            {
                // Contract.erpId the order is registered under in the ERP (#205): defaulted from the
                // counterparty's main contract at checkout, changeable by staff before submission.
                name: 'selectedContractId',
                type: 'string',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Selected contract ID' }],
            },
            {
                // BusinessRejectionReason.code (issue #204), set alongside erpStatus=REJECTED.
                // See plugin-reservation's ReservationWriteOffSyncService.
                name: 'erpRejectionReasonCode',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Rejection Reason Code' }],
            },
            {
                // BusinessRejectionReason.message, same lifecycle as erpRejectionReasonCode above.
                name: 'erpRejectionReasonText',
                type: 'text',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP Rejection Reason Text' }],
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
            {
                name: 'manufacturerPartNumber',
                type: 'string',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manufacturer part number' }],
            },
            // ERP directory GUID resolved to a Manufacturer entity (#116), not a display name.
            {
                name: 'manufacturer',
                type: 'relation',
                entity: Manufacturer,
                graphQLType: 'Manufacturer',
                nullable: true,
                // Hidden from the generic Shop API field; it serves `ProductManufacturer` via a resolver (#168).
                public: false,
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
                // Driven by the ERP storage-location assignment: one location, one product, one organization.
                name: 'organizationId',
                type: 'int',
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Organization' }],
            },
            {
                // Needed because a product can have several storage-location rows, each with its own version history.
                // The per-entityId ordering guard can't pick a winner across rows; lowest priority wins.
                name: 'organizationPriority',
                type: 'int',
                nullable: true,
                public: false,
                label: [
                    { languageCode: LanguageCode.en, value: 'Organization assignment priority' },
                ],
            },
            {
                // Deterministic tiebreak on equal priority, and clears the value when the winner row is deleted.
                name: 'organizationSourceEntityId',
                type: 'string',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Organization assignment source' }],
            },
            {
                // Backend-owned, ERP-sourced: readonly, so the Dashboard never hand-edits it.
                name: 'unitRatioToBase',
                type: 'float',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Sales unit ratio to base' }],
            },
            {
                name: 'unitWeightKg',
                type: 'float',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Sales unit weight (kg)' }],
            },
            {
                name: 'unitVolumeM3',
                type: 'float',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Sales unit volume (m³)' }],
            },
            {
                name: 'unitName',
                type: 'string',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Sales unit name' }],
            },
            {
                // Join key so UnitStreamHandler can refresh this variant when UnitChanged
                // arrives after the product (audit finding, mivend#103).
                name: 'defaultSalesUnitId',
                type: 'string',
                nullable: true,
                readonly: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Default sales unit (ERP id)' }],
            },
        ],
        StockLocation: [
            {
                // StockLocation has no native external-id field, so this links it to Warehouse.erpId for idempotency.
                name: 'warehouseErpId',
                type: 'string',
                nullable: true,
                unique: true,
                label: [{ languageCode: LanguageCode.en, value: 'Warehouse ERP ID' }],
            },
        ],
        StockLevel: [
            {
                // Caps ATP because ERP takes reservations from channels mivend never sees as events.
                // The local ledger alone cannot be trusted as the ceiling.
                name: 'erpAvailableQuantity',
                type: 'int',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'ERP available quantity' }],
            },
        ],
        Collection: [
            {
                // What the ERP feed alone says (hidden/deleted/placeholder), so a revived parent can
                // unhide its children without losing which of them the feed hides itself.
                name: 'feedHidden',
                type: 'boolean',
                defaultValue: false,
                nullable: false,
                internal: true,
            },
            {
                // Must survive the Kafka isActive/isDeleted recompute, which reads it before applying the feed.
                // String enum, not nullable boolean: that renders as an unreadable three-way checkbox in admin.
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
                // Once enabled, every variant must carry organizationId and online payment must split per organization.
                // No silent single-payment fallback: erp-import rejects records without organizationId.
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
                            'one proforma invoice per organization before charging the customer.',
                    },
                ],
            },
        ],
    },
    orderOptions: {
        orderCodeStrategy: new NumberingOrderCodeStrategy(),
        orderItemPriceCalculationStrategy: new CustomerPriceCalculationStrategy(),
    },
    catalogOptions: {
        // A branch is a soft staff-grouping tag, not a Channel-shaped catalog or pricing partition.
        // So it deliberately does not use MultiChannelStockLocationStrategy.
        stockLocationStrategy: new BranchStockLocationStrategy(),
    },
    paymentOptions: {
        paymentMethodHandlers: [
            offlineTermsPaymentHandler,
            onlineStubPaymentHandler,
            cashPaymentHandler,
        ],
    },
    plugins: [
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // Root-relative: Host-header detection bakes internal hosts into asset URLs behind a rewriting proxy.
            // Requires /assets proxied under the storefront's own origin (see storefront/vite.config.ts).
            assetUrlPrefix: process.env.ASSET_URL_PREFIX ?? '/assets/',
            // S3-compatible storage (Garage in dev) when S3_ENDPOINT is set, else the local dir.
            ...(process.env.S3_ENDPOINT
                ? {
                      storageStrategyFactory: configureS3AssetStorage({
                          bucket: process.env.S3_BUCKET ?? '',
                          credentials: {
                              accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
                              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
                          },
                          nativeS3Configuration: {
                              endpoint: process.env.S3_ENDPOINT,
                              region: process.env.S3_REGION ?? 'garage',
                              forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
                          },
                      }),
                  }
                : {}),
        }),
        emailPlugin,
        // Unlike BullMQ's shared queue, activeQueues filters in SQL, giving real per-process isolation.
        // worker.ts and worker-email.ts rely on this split for isolation.
        DefaultJobQueuePlugin.init({}),
        // Recurring plugin work must use this: worker-only and DB-locked (DefaultSchedulerStrategy).
        DefaultSchedulerPlugin.init({}),
        // Dashboard is a standalone app, so no .init(): this registers only to expose the metricSummary query.
        DashboardPlugin,
        // Not in packages/plugins: @vendure/dashboard can't find extensions in pnpm-symlinked packages.
        // Discovery only works through a relative import reachable from vendure-config.ts.
        SystemHealthDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        DefaultSuperadminAlertDashboardPlugin,
        // Same shape/reasoning as SystemHealthDashboardPlugin above — see
        // src/dashboard/branch-consolidation/index.ts.
        BranchConsolidationAlertDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        IntegrationHealthDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        // Own page, not a section on integration-health, which is already dense.
        ErpReconciliationDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        OrganizationsDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        ErpUsersDashboardPlugin,
        ProductPhotosDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        CounterpartyDashboardPlugin,
        // Not in packages/plugins: pnpm-symlinked packages' dashboard extensions aren't discovered.
        // Defense in depth: backstops AccessControlPlugin's bootstrap-time self-provisioning.
        RoleProvisioningDashboardPlugin,
        CustomerPricingPlugin.init({ defaultPriceTypeCode }),
        AccessControlPlugin.init({
            branchNames,
            defaultPriceTypeCode,
            defaultCurrencyCode,
            instanceType,
        }),
        SessionManagementPlugin.init({
            maxActiveSessionsPerUser: sessionOptions.maxActiveSessionsPerUser,
        }),
        ApprovalWorkflowPlugin,
        VersioningPlugin,
        CounterpartyPlugin,
        PriceEntryPlugin,
        NumberingPlugin.init({ instanceNumberCode }),
        OrderIdentityPlugin,
        // Issue #102: Admin-API-only, runs on every instance like PriceEntryPlugin/CounterpartyPlugin
        // — only erp-integration's handler (central-only) ever writes to it.
        RetroBonusPlugin,
        SettlementPlugin,
        // Before DocumentsPlugin: its schema extends ProformaInvoice, and Vendure applies extensions in plugin order.
        ...instancePlugins,
        DocumentsPlugin,
        DeferredPaymentPlugin,
        OnlinePaymentPlugin,
        PickupShippingPlugin,
        FreightShippingPlugin,
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
            // Separate from instanceType: a real broker connection is opted into per contour, never implied.
            kafkaEnabled: integrationKafkaEnabled,
            defaultVatCode: process.env.INTEGRATION_DEFAULT_VAT_CODE || undefined,
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
                // Topic names follow <writer>.<entity>.events.v1 (search-platform#201).
                topics: {
                    category:
                        process.env.INTEGRATION_KAFKA_TOPIC_CATEGORY ?? 'erp.category.events.v1',
                    organization:
                        process.env.INTEGRATION_KAFKA_TOPIC_ORGANIZATION ??
                        'erp.organization.events.v1',
                    warehouse:
                        process.env.INTEGRATION_KAFKA_TOPIC_WAREHOUSE ?? 'erp.warehouse.events.v1',
                    'price-type':
                        process.env.INTEGRATION_KAFKA_TOPIC_PRICE_TYPE ??
                        'erp.price-type.events.v1',
                    'vat-rate':
                        process.env.INTEGRATION_KAFKA_TOPIC_VAT_RATE ?? 'erp.vat-rate.events.v1',
                    product: process.env.INTEGRATION_KAFKA_TOPIC_PRODUCT ?? 'erp.product.events.v1',
                    offer: process.env.INTEGRATION_KAFKA_TOPIC_OFFER ?? 'erp.offer.events.v1',
                    price: process.env.INTEGRATION_KAFKA_TOPIC_PRICE ?? 'erp.price.events.v1',
                    stock: process.env.INTEGRATION_KAFKA_TOPIC_STOCK ?? 'erp.stock.events.v1',
                    // Sole source of ProductVariant.customFields.organizationId (ERP storage-location register).
                    'storage-location':
                        process.env.INTEGRATION_KAFKA_TOPIC_STORAGE_LOCATION ??
                        'erp.storage-location.events.v1',
                    // Quantity dimension deliberately deferred; not a second organizationId source.
                    'stock-organization':
                        process.env.INTEGRATION_KAFKA_TOPIC_STOCK_ORGANIZATION ??
                        'erp.stock-organization.events.v1',
                    // All ERP order events (registration result, changed, cancel result) share one
                    // topic, routed by the message header `type`; see kafka-consumer.service.ts.
                    'order-registration-result': orderEventsTopic,
                    'order-changed': orderEventsTopic,
                    'order-cancel-result': orderEventsTopic,
                    department:
                        process.env.INTEGRATION_KAFKA_TOPIC_DEPARTMENT ??
                        'erp.department.events.v1',
                    counterparty:
                        process.env.INTEGRATION_KAFKA_TOPIC_COUNTERPARTY ??
                        'erp.counterparty.events.v1',
                    // search-platform#129: register-driven creditBalance, independent of
                    // counterparty above — see CounterpartyCreditBalanceStreamHandler.
                    'counterparty-credit-balance':
                        process.env.INTEGRATION_KAFKA_TOPIC_COUNTERPARTY_CREDIT_BALANCE ??
                        'erp.counterparty-credit-balance.events.v1',
                    // Issue #109: Administrator enrichment (erpId/departmentId), also the
                    // resolution target for CounterpartyChanged's manager_id/manager_ids.
                    user: process.env.INTEGRATION_KAFKA_TOPIC_USER ?? 'erp.user.events.v1',
                    // Issue #107: per-product gift/percent promo rules — see PromoRuleStreamHandler.
                    'promo-rule':
                        process.env.INTEGRATION_KAFKA_TOPIC_PROMO_RULE ??
                        'erp.promo-rule.events.v1',
                    // Issue #100: the ERP's "Точка продаж" (point of sale) — feeds TradingPoint
                    // in @mivend/plugin-counterparty. See PointOfSaleStreamHandler.
                    'point-of-sale':
                        process.env.INTEGRATION_KAFKA_TOPIC_POINT_OF_SALE ??
                        'erp.point-of-sale.events.v1',
                    // Issue #105: the ERP's "Договор" (contract) — feeds Contract in
                    // @mivend/plugin-counterparty. See ContractStreamHandler.
                    contract:
                        process.env.INTEGRATION_KAFKA_TOPIC_CONTRACT ?? 'erp.contract.events.v1',
                    // Issue #103: the ERP's packaging/sales-unit reference feed (UnitChanged). See
                    // UnitStreamHandler and docs/order-flow.md's mivend#103 section.
                    unit: process.env.INTEGRATION_KAFKA_TOPIC_UNIT ?? 'erp.unit.events.v1',
                    // Issue #164: manufacturer reference directory (names for the catalog facet).
                    manufacturer:
                        process.env.INTEGRATION_KAFKA_TOPIC_MANUFACTURER ??
                        'erp.manufacturer.events.v1',
                    region: process.env.INTEGRATION_KAFKA_TOPIC_REGION ?? 'erp.region.events.v1',
                    'legal-form':
                        process.env.INTEGRATION_KAFKA_TOPIC_LEGAL_FORM ??
                        'erp.legal-form.events.v1',
                    bank: process.env.INTEGRATION_KAFKA_TOPIC_BANK ?? 'erp.bank.events.v1',
                    'bank-account':
                        process.env.INTEGRATION_KAFKA_TOPIC_BANK_ACCOUNT ??
                        'erp.bank-account.events.v1',
                    // Issue #181: normalized product photos (metadata + pre-signed URL).
                    'product-photo':
                        process.env.INTEGRATION_KAFKA_TOPIC_PRODUCT_PHOTO ??
                        'erp.product-photo.events.v1',
                    // Issue #108: the ERP's own per-counterparty/contract automatic discount
                    // engine. See DiscountRuleStreamHandler.
                    'discount-rule':
                        process.env.INTEGRATION_KAFKA_TOPIC_DISCOUNT_RULE ??
                        'erp.discount-rule.events.v1',
                    // Issue #101: shipment-time confirmed discount facts. See GrantedDiscountStreamHandler.
                    'granted-discount':
                        process.env.INTEGRATION_KAFKA_TOPIC_GRANTED_DISCOUNT ??
                        'erp.granted-discount.events.v1',
                    // Issue #102: the ERP's retro-bonus terms log. See RetroBonusRuleStreamHandler.
                    'retro-bonus-rule':
                        process.env.INTEGRATION_KAFKA_TOPIC_RETRO_BONUS_RULE ??
                        'erp.retro-bonus-rule.events.v1',
                    position:
                        process.env.INTEGRATION_KAFKA_TOPIC_POSITION ?? 'erp.position.events.v1',
                    'granted-retro-bonus':
                        process.env.INTEGRATION_KAFKA_TOPIC_GRANTED_RETRO_BONUS ??
                        'erp.granted-retro-bonus.events.v1',
                    // Issue #224: receivables history. See SettlementDocumentStreamHandler.
                    'settlement-document':
                        process.env.INTEGRATION_KAFKA_TOPIC_SETTLEMENT_DOCUMENT ??
                        'erp.settlement-document.events.v1',
                    'settlement-balance':
                        process.env.INTEGRATION_KAFKA_TOPIC_SETTLEMENT_BALANCE ??
                        'erp.settlement-balance.events.v1',
                    // Issue #227: document type reference, see SettlementDocumentTypeStreamHandler.
                    'settlement-document-type':
                        process.env.INTEGRATION_KAFKA_TOPIC_SETTLEMENT_DOCUMENT_TYPE ??
                        'erp.settlement-document-type.events.v1',
                    // sp#200: order status reference, see OrderStatusStreamHandler.
                    'order-status':
                        process.env.INTEGRATION_KAFKA_TOPIC_ORDER_STATUS ??
                        'erp.order-status.events.v1',
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
            resyncSourceSystem: process.env.INTEGRATION_RESYNC_SOURCE_SYSTEM,
            eventContractsRegistryToken: process.env.EVENT_CONTRACTS_REGISTRY_TOKEN,
        }),
        // Before ReservationPlugin: its schema extension references CheckResult, and extensions apply in list order.
        ChecksPlugin,
        ReservationPlugin.init({}),
        NotificationPlugin,
        MoqPlugin,
        SavedViewsPlugin,
    ],
};
