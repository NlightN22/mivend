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
    parent: { slug: string } | null;
    customFields: { visibilityOverride: string | null; feedHidden: boolean } | null;
}

const slugOf = (erpId: string): string => `cat-${erpId}`;
const ADMIN_Q = `query($s: String) { collection(slug: $s) { id isPrivate parent { slug } customFields { visibilityOverride feedHidden } } }`;

export interface FeedClient {
    admin(key: FeedKey): Promise<AdminCategory | null>;
    shopVisible(key: FeedKey): Promise<boolean>;
    setOverride(key: FeedKey, value: 'visible' | 'hidden' | null): Promise<void>;
}

export async function feedClient(): Promise<FeedClient> {
    const env = loadContourEnv();
    const token = await adminTokenFor(env.superadmin.username, env.superadmin.password);
    const cookie = await shopLoginCookie(env.customer.email, env.customer.password);
    const admin = async (key: FeedKey): Promise<AdminCategory | null> =>
        (
            await adminGql<{ collection: AdminCategory | null }>(
                ADMIN_Q,
                { s: slugOf(feedId(key)) },
                token,
            )
        ).data.collection;
    return {
        admin,
        async shopVisible(key) {
            const data = await shopGql<{ collection: { id: string } | null }>(
                `query($s: String) { collection(slug: $s) { id } }`,
                { s: slugOf(feedId(key)) },
                cookie,
            );
            return data.collection !== null;
        },
        async setOverride(key, value) {
            const row = await admin(key);
            if (!row) throw new Error(`category ${key} is missing`);
            await adminGql(
                `mutation($id: ID!, $o: String, $p: Boolean) { updateCollection(input: { id: $id, isPrivate: $p, customFields: { visibilityOverride: $o } }) { id } }`,
                { id: row.id, o: value, ...(value === null ? {} : { p: value === 'hidden' }) },
                token,
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
