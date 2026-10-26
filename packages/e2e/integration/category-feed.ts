import { adminGql, shopGql, shopLoginCookie } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { loadContourEnv, envValue } from './contour-env';

export const FEED_POLL_TIMEOUT_MS = 12 * 60_000;
const FEED_POLL_INTERVAL_MS = 5000;

export type FeedKey =
    | 'DELETED_PARENT'
    | 'DELETED_PARENT_CHILD'
    | 'INACTIVE'
    | 'INACTIVE_CHILD'
    | 'REVIVE_PARENT'
    | 'REVIVE_CHILD'
    | 'REVIVE_FEED_HIDDEN_CHILD'
    | 'LATE_PARENT'
    | 'LATE_CHILD'
    | 'MOVE_CHILD'
    | 'MOVE_FROM'
    | 'MOVE_TO'
    | 'TOMBSTONE'
    | 'TOMBSTONE_CHILD';

export function feedId(key: FeedKey): string {
    const value = envValue(`STAGING_FEED_CAT_${key}`);
    if (!value)
        throw new Error(
            `STAGING_FEED_CAT_${key} is missing in the staging env file (see the category-feed data request)`,
        );
    return value;
}

export interface AdminCategory {
    id: string;
    isPrivate: boolean;
    parent: { slug: string; isPrivate: boolean } | null;
    customFields: { visibilityOverride: string | null } | null;
}

const slugOf = (erpId: string): string => `cat-${erpId}`;
// Owner waits run for an hour; sessions are renewed so a long wait never ends in an auth error.
const SESSION_REFRESH_MS = 20 * 60_000;
const ADMIN_Q = `query($s: String) { collection(slug: $s) { id isPrivate parent { slug isPrivate } customFields { visibilityOverride } } }`;

export interface FeedClient {
    admin(key: FeedKey): Promise<AdminCategory | null>;
    shopVisible(key: FeedKey): Promise<boolean>;
    ownFeedHidden(key: FeedKey): Promise<boolean>;
    setOverride(key: FeedKey, value: 'visible' | 'hidden' | null): Promise<void>;
}

export async function feedClient(): Promise<FeedClient> {
    const env = loadContourEnv();
    const token = (): Promise<string> =>
        adminTokenFor(env.superadmin.username, env.superadmin.password);
    let cookie = await shopLoginCookie(env.customer.email, env.customer.password);
    let cookieAt = Date.now();
    const freshCookie = async (): Promise<string> => {
        if (Date.now() - cookieAt > SESSION_REFRESH_MS) {
            cookie = await shopLoginCookie(env.customer.email, env.customer.password);
            cookieAt = Date.now();
        }
        return cookie;
    };
    const admin = async (key: FeedKey): Promise<AdminCategory | null> =>
        (
            await adminGql<{ collection: AdminCategory | null }>(
                ADMIN_Q,
                { s: slugOf(feedId(key)) },
                await token(),
            )
        ).data.collection;
    return {
        admin,
        async ownFeedHidden(key) {
            const row = await admin(key);
            return row?.isPrivate === true && row.parent?.isPrivate !== true;
        },
        async shopVisible(key) {
            const data = await shopGql<{ collection: { id: string } | null }>(
                `query($s: String) { collection(slug: $s) { id } }`,
                { s: slugOf(feedId(key)) },
                await freshCookie(),
            );
            return data.collection !== null;
        },
        async setOverride(key, value) {
            const row = await admin(key);
            if (!row) throw new Error(`category ${key} is missing`);
            await adminGql(
                `mutation($id: ID!, $o: String, $p: Boolean) { updateCollection(input: { id: $id, isPrivate: $p, customFields: { visibilityOverride: $o } }) { id } }`,
                { id: row.id, o: value, ...(value === null ? {} : { p: value === 'hidden' }) },
                await token(),
            );
        },
    };
}

// Bounded polling: the periodic recompute can lag by one interval.
export async function pollUntil(
    label: string,
    check: () => Promise<boolean>,
    timeoutMs = FEED_POLL_TIMEOUT_MS,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() >= deadline)
            throw new Error(`${label}: not reached within ${timeoutMs / 1000}s`);
        await new Promise(r => setTimeout(r, FEED_POLL_INTERVAL_MS));
    }
}

export const OWNER_WAIT_TIMEOUT_MS = 15 * 60_000;

// Prints the awaited ERP owner transition so the lead sees what to request; bounded like any poll.
export async function awaitOwner(
    transition: string,
    check: () => Promise<boolean>,
    timeoutMs = OWNER_WAIT_TIMEOUT_MS,
): Promise<void> {
    console.log(
        `[category-feed] WAITING FOR ERP OWNER: ${transition} (up to ${timeoutMs / 60_000} min)`,
    );
    await pollUntil(`ERP owner step "${transition}"`, check, timeoutMs);
    console.log(`[category-feed] RECEIVED: ${transition}`);
}

// Waits for the ERP-sent initial state a scenario starts from; the exchange cycle takes minutes.
export async function awaitInitialState(
    what: string,
    check: () => Promise<boolean>,
    timeoutMs = OWNER_WAIT_TIMEOUT_MS,
): Promise<void> {
    console.log(`[category-feed] WAITING FOR INITIAL STATE: ${what}`);
    await pollUntil(`initial state "${what}"`, check, timeoutMs);
}

const INGESTION_DELETE_PATH = '/api/ingestion/v1/entities/delete';
const TOMBSTONE_ATTEMPTS = 5;

function requiredEnv(key: string): string {
    const value = envValue(key);
    if (!value) throw new Error(`${key} is missing in the staging env file`);
    return value;
}

// Base URL and source id come only from the staging env file; the ERP sends categories under that source.
export async function sendCategoryTombstone(key: FeedKey): Promise<void> {
    const baseUrl = requiredEnv('INTEGRATION_SERVICE_BASE_URL');
    const apiKey = requiredEnv('INTEGRATION_SERVICE_API_KEY');
    const sourceSystem = requiredEnv('INTEGRATION_RESYNC_SOURCE_SYSTEM');
    const now = new Date().toISOString();
    const body = JSON.stringify({
        sourceSystem,
        entityType: 'category',
        entityId: feedId(key),
        version: now,
        isDeleted: true,
        updatedAt: now,
    });
    for (let attempt = 1; ; attempt++) {
        const response = await fetch(new URL(INGESTION_DELETE_PATH, baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
            body,
            signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 202) return;
        if (response.status !== 429 || attempt >= TOMBSTONE_ATTEMPTS)
            throw new Error(`tombstone request answered ${response.status}`);
        await new Promise(r => setTimeout(r, attempt * 2000));
    }
}
