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

const instanceType = (process.env.INSTANCE_TYPE ?? 'branch') as 'central' | 'branch';

// Plugin sets diverge here as sync and ERP-integration plugins are added in Phase 4
const instancePlugins = instanceType === 'central' ? [] : [];

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
            },
            rabbitmq: {
                url: process.env.RABBITMQ_URL ?? 'amqp://mivend:mivend@localhost:5672',
            },
            erpAdapter: new StubErpAdapter(),
        }),
        ...instancePlugins,
    ],
};
