import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { INestApplication } from '@nestjs/common';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { RequestContextService, SessionService } from '@vendure/core';
// Deep import: AdminApiModule/ShopApiModule are Vendure-internal (not re-exported from
// @vendure/core's public index) but are the only handle NestJS gives us to pick "the Admin API's
// schema" vs "the Shop API's schema" out of the two separate GraphQLModule instances Vendure
// registers — see api-internal-modules.d.ts. This reads them, never modifies @vendure/core.
import { AdminApiModule, ShopApiModule } from '@vendure/core/dist/api/api-internal-modules';
import { NotificationRecipientService } from '@mivend/plugin-notification';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import type { GraphQLSchema } from 'graphql';

// Vendure's own ApiOptions has no subscriptions/WS transport setting (see
// configure-graphql-module.js: it hands Apollo a fixed option set with no `subscriptions` key,
// and Apollo Server 4 dropped built-in subscription support entirely) — the recommended
// replacement, graphql-ws, has to be wired up by hand against a raw `ws` server sitting next to
// the two HTTP GraphQL endpoints. One graphql-ws server per API (admin/shop), each serving that
// API's own schema, both on the same HTTP server via distinct upgrade paths.
export function mountNotificationSubscriptions(app: INestApplication): void {
    const httpServer = app.getHttpServer();
    const recipientService = app.get(NotificationRecipientService);
    const sessionService = app.get(SessionService);
    const requestContextService = app.get(RequestContextService);

    mountOne(app, AdminApiModule, 'admin-api', '/admin-api-subscriptions', 'admin');
    mountOne(app, ShopApiModule, 'shop-api', '/shop-api-subscriptions', 'shop');

    function mountOne(
        nestApp: INestApplication,
        apiModule: typeof AdminApiModule | typeof ShopApiModule,
        _label: string,
        path: string,
        apiType: 'admin' | 'shop',
    ): void {
        const schema: GraphQLSchema = nestApp
            .select(apiModule)
            .get(GraphQLSchemaHost, { strict: false }).schema;

        const wsServer = new WebSocketServer({ noServer: true, path });
        httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
            if (request.url !== path) return;
            wsServer.handleUpgrade(request, socket, head, ws => {
                wsServer.emit('connection', ws, request);
            });
        });

        useServer(
            {
                schema,
                context: async (ctx: { connectionParams?: Record<string, unknown> }) => {
                    const token = (ctx.connectionParams?.authorization as string | undefined)
                        ?.replace(/^Bearer\s+/i, '')
                        .trim();
                    if (!token) return {};
                    const session = await sessionService.getSessionFromToken(token);
                    const user = (session as { user?: { id: string } } | undefined)?.user;
                    if (!user) return {};
                    const requestContext = await requestContextService.create({ apiType });
                    const recipient =
                        apiType === 'admin'
                            ? await recipientService.getCurrentAdministratorByUserId(
                                  requestContext,
                                  user.id,
                              )
                            : await recipientService.getCurrentCustomerByUserId(
                                  requestContext,
                                  user.id,
                              );
                    return recipient ?? {};
                },
            },
            wsServer,
        );
    }
}
