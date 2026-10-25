import { test, expect } from '@playwright/test';
import {
    awaitInitialState,
    awaitOwner,
    feedClient,
    feedId,
    pollUntil,
    sendCategoryTombstone,
    type FeedClient,
} from './category-feed';

// Each test waits (bounded, printed) for its own initial state, then for one owner transition; tests are independent.
test.describe.configure({ timeout: 40 * 60_000 });

let client: FeedClient;
test.beforeAll(async () => {
    client = await feedClient();
});

test('revived parent unhides its children except the feed-hidden one', async () => {
    await awaitInitialState(
        'REVIVE_PARENT hidden with REVIVE_CHILD hidden',
        async () =>
            (await client.admin('REVIVE_PARENT'))?.isPrivate === true &&
            !(await client.shopVisible('REVIVE_CHILD')),
    );
    await awaitOwner('clear the deletion mark on REVIVE_PARENT', () =>
        client.shopVisible('REVIVE_PARENT'),
    );
    await pollUntil('child unhidden', () => client.shopVisible('REVIVE_CHILD'));
    expect(await client.shopVisible('REVIVE_FEED_HIDDEN_CHILD')).toBe(false);
    expect(await client.ownFeedHidden('REVIVE_FEED_HIDDEN_CHILD')).toBe(true);
});

const LATE_INITIAL_TIMEOUT_MS = 70 * 60_000;
const LATE_OWNER_TIMEOUT_MS = 40 * 60_000;

test('parent arriving after its child: placeholder first, then filled in', async () => {
    test.setTimeout(125 * 60_000);
    await awaitInitialState(
        'LATE_CHILD present under a LATE_PARENT placeholder (own-feed hidden)',
        async () =>
            (await client.admin('LATE_CHILD'))?.parent?.slug?.startsWith('cat-') === true &&
            (await client.ownFeedHidden('LATE_PARENT')) &&
            !(await client.shopVisible('LATE_CHILD')),
        LATE_INITIAL_TIMEOUT_MS,
    );
    // IS publishes the held child and the parent in no guaranteed order, so wait for both ends.
    await awaitOwner(
        'register LATE_PARENT for sending',
        async () =>
            (await client.shopVisible('LATE_PARENT')) && (await client.shopVisible('LATE_CHILD')),
        LATE_OWNER_TIMEOUT_MS,
    );
    expect(await client.shopVisible('LATE_PARENT')).toBe(true);
    expect(await client.shopVisible('LATE_CHILD')).toBe(true);
});

test('parent change moves the category under the new parent', async () => {
    const fromSlug = `cat-${feedId('MOVE_FROM')}`;
    const toSlug = `cat-${feedId('MOVE_TO')}`;
    await awaitInitialState(
        'MOVE_CHILD under MOVE_FROM',
        async () => (await client.admin('MOVE_CHILD'))?.parent?.slug === fromSlug,
    );
    await awaitOwner(
        'change the parent of MOVE_CHILD from MOVE_FROM to MOVE_TO',
        async () => (await client.admin('MOVE_CHILD'))?.parent?.slug === toSlug,
    );
    expect(await client.shopVisible('MOVE_CHILD')).toBe(await client.shopVisible('MOVE_TO'));
});

// The ERP never sends category tombstones yet (1C issue #22, ut103-torg): the spec sends one via Integration Service ingestion.
test('tombstone hides the category and its children', async () => {
    await awaitInitialState(
        'TOMBSTONE and TOMBSTONE_CHILD visible, child under TOMBSTONE',
        async () =>
            (await client.shopVisible('TOMBSTONE')) &&
            (await client.shopVisible('TOMBSTONE_CHILD')) &&
            (await client.admin('TOMBSTONE_CHILD'))?.parent?.slug === `cat-${feedId('TOMBSTONE')}`,
    );
    const before = await client.admin('TOMBSTONE');
    await sendCategoryTombstone('TOMBSTONE');
    await pollUntil('tombstone hidden', async () => !(await client.shopVisible('TOMBSTONE')));
    await pollUntil('child hidden', async () => !(await client.shopVisible('TOMBSTONE_CHILD')));
    const after = await client.admin('TOMBSTONE');
    expect(await client.ownFeedHidden('TOMBSTONE')).toBe(true);
    expect(after?.parent?.slug).toBe(before?.parent?.slug);
});
