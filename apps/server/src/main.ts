import { bootstrap } from '@vendure/core';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config } from './vendure-config';
import { mountNotificationSubscriptions } from './subscriptions';
import { assertDatabaseLocale } from './db-locale-check';
import { carryOverOrderLineIdentity } from './order-line-identity-carryover';

// Mounted only with API_DOCS_ENABLED=true; must run in `onBeforeAppListen` (later routes 404).
// (Nest finalizes routing at app.listen()). REST-only docs, see issue #28.
function mountApiDocs(app: INestApplication): void {
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
            .setTitle('mivend REST API')
            .setDescription(
                'External REST endpoints used by the ERP integration. ' +
                    'Shop/Admin APIs are GraphQL — see /shop-api and /admin-api.',
            )
            .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'erp-import-token')
            .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Api-Key' }, 'erp-callback-api-key')
            .build(),
    );
    SwaggerModule.setup('api-docs', app, document);
}

assertDatabaseLocale()
    .then(carryOverOrderLineIdentity)
    .then(() =>
        bootstrap(config, {
            onBeforeAppListen: app => {
                if (process.env.API_DOCS_ENABLED === 'true') mountApiDocs(app);
                // Needs the raw HTTP server before app.listen() — see subscriptions.ts.
                mountNotificationSubscriptions(app);
            },
        }),
    )
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
