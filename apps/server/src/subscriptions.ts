import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { INestApplication } from '@nestjs/common';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import { ChannelService, RequestContext, SessionService } from '@vendure/core';
import {
    administratorNotificationSubscriptionFilter,
    customerNotificationSubscriptionFilter,
    notificationTypeSDL,
    NotificationRecipientService,
    NotificationService,
    resolveBroadcastVisibility,
    type AdministratorSubscriptionIdentity,
    type NotificationReceivedEvent,
} from '@mivend/plugin-notification';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { withFilter } from 'graphql-subscriptions';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';

// Apollo Server 4 dropped subscriptions and ApiOptions has no WS setting: wire graphql-ws by hand.
// Don't deep-import @vendure/core internals: it silently nulls other plugins' extend resolvers.
const notificationSubscriptionSDL = `
    scalar DateTime

    ${notificationTypeSDL}

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
                        // Stream end yields no payload; graphql-subscriptions' FilterFn types it as possibly undefined.
                        // filter() assumes a real event, so guard here instead of loosening its signature.
                        (
                            payload: NotificationReceivedEvent | undefined,
                            variables: unknown,
                            context: unknown,
                        ) => payload !== undefined && filter(payload, variables, context),
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
    const channelService = app.get(ChannelService);
    const orderVisibility = app.get(OrderVisibilityService);

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
                context: async (ctx: {
                    connectionParams?: Record<string, unknown>;
                }): Promise<AdministratorSubscriptionIdentity | Record<string, never>> => {
                    const token = (ctx.connectionParams?.authorization as string | undefined)
                        ?.replace(/^Bearer\s+/i, '')
                        .trim();
                    if (!token) return {};
                    const session = await sessionService.getSessionFromToken(token);
                    const user = (session as { user?: { id: string } } | undefined)?.user;
                    if (!user || !session) return {};
                    // Build from the session so userHasPermissions() sees the real admin, not an anonymous context.
                    // resolveBroadcastVisibility() depends on that to gate broadcast sourceTypes.
                    const channel = await channelService.getDefaultChannel();
                    const requestContext = new RequestContext({
                        apiType,
                        channel,
                        session,
                        isAuthorized: true,
                        authorizedAsOwnerOnly: false,
                    });
                    if (apiType === 'admin') {
                        const recipient = await recipientService.getCurrentAdministratorByUserId(
                            requestContext,
                            user.id,
                        );
                        if (!recipient) return {};
                        const { deniedSourceTypes } = resolveBroadcastVisibility(requestContext);
                        return {
                            ...recipient,
                            deniedBroadcastSourceTypes: deniedSourceTypes,
                            canSeeOrder: async orderId =>
                                (await orderVisibility.visibleIds(requestContext, [orderId])).has(
                                    orderId,
                                ),
                        };
                    }
                    const recipient = await recipientService.getCurrentCustomerByUserId(
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
