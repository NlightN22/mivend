import { bootstrap } from '@vendure/core';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config } from './vendure-config';

// Documents only the custom REST endpoints (ERP import/callback) — Shop/Admin
// APIs are GraphQL and already self-documenting via introspection. See issue
// #28 and AGENTS.md's "REST endpoint DTOs must be classes" rule.
//
// Must run via `onBeforeAppListen`, not after `bootstrap()` resolves — Vendure
// calls `app.listen()` internally before returning, and Nest finalizes its
// routing/fallback-handler chain at that point. Routes registered afterward
// (e.g. in a `.then()`) are silently unreachable (404), even though the
// OpenAPI document itself builds correctly.
function mountApiDocs(app: INestApplication): void {
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
            .setTitle('mivend REST API')
            .setDescription(
                'External REST endpoints used by the ERP integration (1C). ' +
                    'Shop/Admin APIs are GraphQL — see /shop-api and /admin-api.',
            )
            .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'erp-import-token')
            .build(),
    );
    SwaggerModule.setup('api-docs', app, document);
}

bootstrap(config, { onBeforeAppListen: mountApiDocs }).catch(err => {
    console.error(err);
    process.exit(1);
});
