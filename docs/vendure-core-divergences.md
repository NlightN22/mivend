# Deliberate divergences from Vendure core behavior

We never modify `node_modules/@vendure`. These are places where a plugin replaces or works around core behavior on purpose.
On every Vendure upgrade, re-check each entry against the new core source; the test
`packages/plugins/session-management/src/__tests__/unit/vendure-core-assumptions.test.ts` fails when an assumption below stops holding.

| Plugin | What core does | What we do instead | Why | Re-check on upgrade |
| --- | --- | --- | --- | --- |
| session-management (`ShopLogoutResolver`, `deleteOwnSessions`) | Shop `logout` and `endAllSessions` call `SessionService.deleteSessionsByUser`, deleting every session of the user | Delete only the user's own sessions and keep acting sessions | An acting session (manager on behalf of a customer) belongs to the same `User` as the customer | `AuthService.logout`: any new event, cleanup or cookie handling must be mirrored in `ShopLogoutResolver` |
| acting-session (middleware) | `extractSessionToken` reads the cookie before the bearer header; `AuthGuard.getSession` calls `setSessionToken` (even with an empty token for a dead session) and the cookie-session middleware then emits `Set-Cookie` | Drop the `Cookie` header and discard every `Set-Cookie` of shop requests carrying `x-acting-session` | A customer's cookie in the same browser would otherwise win over the acting bearer token, and a dead acting token would overwrite it | Order of `extractSessionToken` and of `cookie-session` in `AppModule.configure`; `AuthGuard.getSession` |
| acting-session (`ActingActiveOrderStrategy`) | `SessionService.createNewAuthenticatedSession` merges the user's newest active order into the new session | Real sessions never keep an order carrying the acting marker; their own cart is found instead | The acting cart is the customer's newest active order and must not leak into a real login | `OrderService.getActiveOrderForUser` and `mergeOrders` |
| acting-session (`exchangeActingTicket`) | Authenticated sessions are created by `createNewAuthenticatedSession`, token goes out via `setSessionToken` | Create the session through the repository, return the token in the response body, never set a cookie | The acting tab must not overwrite a real customer cookie | `AuthenticatedSession` entity fields and session cache serialization |
| core `UserService` password change/reset and `AuthService.logout` | They delete every session of the user | Nothing; accepted | A password change or reset of the customer also ends their acting sessions | `SessionService.deleteSessionsByUser` callers |
