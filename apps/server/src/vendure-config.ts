import path from 'path';
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
import { SearchPlugin, elasticsearchPlugin } from '@mivend/plugin-search';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { SyncPlugin, StubErpAdapter } from '@mivend/plugin-sync';
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

// Only central talks to the ERP/payment providers (AGENTS.md sync rule #6)
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
        ErpImportPlugin,
        CrossReferencePlugin,
        elasticsearchPlugin,
        SearchPlugin,
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
