import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { INestApplication } from '@nestjs/common';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import { RequestContextService, SessionService } from '@vendure/core';
import {
    administratorNotificationSubscriptionFilter,
    customerNotificationSubscriptionFilter,
    NotificationRecipientService,
    NotificationService,
    type NotificationReceivedEvent,
} from '@mivend/plugin-notification';
import { withFilter } from 'graphql-subscriptions';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';

// Vendure's own ApiOptions has no subscriptions/WS transport setting (see
// configure-graphql-module.js: it hands Apollo a fixed option set with no `subscriptions` key,
// and Apollo Server 4 dropped built-in subscription support entirely) — the recommended
// replacement, graphql-ws, has to be wired up by hand against a raw `ws` server sitting next to
// the two HTTP GraphQL endpoints.
//
// IMPORTANT — do not "just" grab Vendure's real Admin/Shop API GraphQLSchema for this (an earlier
// version of this file did, via `app.select(AdminApiModule).get(GraphQLSchemaHost)`, deep-
// importing `@vendure/core/dist/api/api-internal-modules`). That deep import alone — even with
// the imported classes never called or referenced beyond a `void` reference — silently broke
// EVERY other plugin's custom "extend type Query"/"extend type Mutation" resolver across the
// whole app: they all started resolving to null with zero server-side error logged. Confirmed by
// bisection: importing AdminApiModule/ShopApiModule from that internal path, with no other code
// from this file executing, was reproducible and sufficient on its own to break e.g.
// `departments`/`priceTypes`/`notifications`. Root cause not fully diagnosed (suspected dual-
// module-instance/decorator-metadata clash from loading a Vendure-internal compiled module a
// second time outside its own module graph) — the fix is to never reach into `@vendure/core`'s
// internals for this. Instead, this file builds its OWN small, fully independent executable
// schema containing just the `Notification` type and `notificationReceived` subscription field,
// and mounts a graphql-ws server against THAT — completely decoupled from Vendure's real
// Admin/Shop schemas. Queries and mutations for notifications still go through the normal HTTP
// Admin/Shop API (packages/plugins/notification's own resolvers, unaffected by any of this); only
// the `notificationReceived` subscription operation is served over these WS endpoints.
const notificationSubscriptionSDL = `
    scalar DateTime

    enum NotificationKind {
        info
        success
        warning
        error
    }

    enum NotificationStatus {
        unread
        read
        resolved
    }

    type Notification {
        id: ID!
        kind: NotificationKind!
        sourceType: String!
        sourceId: String
        title: String!
        message: String!
        status: NotificationStatus!
        readAt: DateTime
        resolvedAt: DateTime
        resolution: String
        createdAt: DateTime!
    }

    type Subscription {
        notificationReceived: Notification!
    }

    # graphql-js requires a Query type even though this schema only ever serves subscription
    # operations over its own WS endpoint.
    type Query {
        _placeholder: Boolean
    }
`;

function buildNotificationSubscriptionSchema(
    notificationService: NotificationService,
    apiType: 'admin' | 'shop',
): GraphQLSchema {
    const filter =
        apiType === 'admin'
            ? administratorNotificationSubscriptionFilter
            : customerNotificationSubscriptionFilter;
    return makeExecutableSchema({
        typeDefs: notificationSubscriptionSDL,
        resolvers: {
            // Pass-through: stored/emitted as a JS Date or ISO string, both serialize fine as-is.
            DateTime: { serialize: (value: unknown) => value },
            Query: {
                _placeholder: (): boolean => true,
            },
            Subscription: {
                notificationReceived: {
                    subscribe: withFilter(
                        () => notificationService.subscribeToReceived(),
                        (
                            payload: NotificationReceivedEvent,
                            variables: unknown,
                            context: unknown,
                        ) => filter(payload, variables, context),
                    ),
                    resolve: (payload: NotificationReceivedEvent) => payload.notificationReceived,
                },
            },
        },
    });
}

export function mountNotificationSubscriptions(app: INestApplication): void {
    const httpServer = app.getHttpServer();
    const notificationService = app.get(NotificationService);
    const recipientService = app.get(NotificationRecipientService);
    const sessionService = app.get(SessionService);
    const requestContextService = app.get(RequestContextService);

    mountOne('/admin-api-subscriptions', 'admin');
    mountOne('/shop-api-subscriptions', 'shop');

    function mountOne(path: string, apiType: 'admin' | 'shop'): void {
        const schema = buildNotificationSubscriptionSchema(notificationService, apiType);
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
