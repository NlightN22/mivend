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
                        // graphql-subscriptions' FilterFn types payload as possibly undefined
                        // (an async iterator can yield no value at stream end) — filter() itself
                        // assumes a real event, so short-circuit here rather than loosen its
                        // signature for a case that only happens after the stream is already
                        // done.
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
                    // A real RequestContext built from the session (rather than
                    // requestContextService.create({ apiType }) with no user) so
                    // ctx.userHasPermissions() below reflects this connection's ACTUAL
                    // administrator, not an anonymous/permission-less context — required for
                    // resolveBroadcastVisibility() to gate broadcast sourceTypes correctly
                    // (issue #87 audit, mivend.audit.85). See RequestContext's own constructor
                    // signature: it accepts a CachedSession directly for exactly this case.
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
                        return { ...recipient, deniedBroadcastSourceTypes: deniedSourceTypes };
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
