import path from 'path';
import { LanguageCode, VendureConfig } from '@vendure/core';
import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { BullMQJobQueuePlugin } from '@vendure/job-queue-plugin/package/bullmq';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

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
    paymentOptions: {
        paymentMethodHandlers: [],
    },
    plugins: [
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
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
        CounterpartyPlugin,
        ...instancePlugins,
    ],
};
