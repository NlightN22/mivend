import { bootstrap } from '@vendure/core';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config } from './vendure-config';
import { mountNotificationSubscriptions } from './subscriptions';
import { assertDatabaseLocale } from './db-locale-check';

// Must run in `onBeforeAppListen`: routes registered after bootstrap() resolves are silently 404
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
            .build(),
    );
    SwaggerModule.setup('api-docs', app, document);
}

assertDatabaseLocale()
    .then(() =>
        bootstrap(config, {
            onBeforeAppListen: app => {
                mountApiDocs(app);
                // Needs the raw HTTP server before app.listen() — see subscriptions.ts.
                mountNotificationSubscriptions(app);
            },
        }),
    )
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
