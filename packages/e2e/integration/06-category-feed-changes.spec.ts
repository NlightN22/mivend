import { test, expect } from '@playwright/test';
import {
    awaitOwner,
    feedClient,
    feedId,
    pollUntil,
    sendCategoryTombstone,
    type FeedClient,
} from './category-feed';

// Each test asserts the precondition, then waits (bounded, printed) for one owner transition; the owner acts one step at a time on request.
test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 });

let client: FeedClient;
test.beforeAll(async () => {
    client = await feedClient();
});

test('revived parent unhides its children except the feed-hidden one', async () => {
    expect((await client.admin('REVIVE_PARENT'))?.isPrivate).toBe(true);
    expect(await client.shopVisible('REVIVE_CHILD')).toBe(false);
    await awaitOwner('clear the deletion mark on REVIVE_PARENT', () =>
        client.shopVisible('REVIVE_PARENT'),
    );
    await pollUntil('child unhidden', () => client.shopVisible('REVIVE_CHILD'));
    expect(await client.shopVisible('REVIVE_FEED_HIDDEN_CHILD')).toBe(false);
    expect(await client.ownFeedHidden('REVIVE_FEED_HIDDEN_CHILD')).toBe(true);
});

test('parent arriving after its child: placeholder first, then filled in', async () => {
    expect(await client.ownFeedHidden('LATE_PARENT')).toBe(true);
    expect((await client.admin('LATE_CHILD'))?.parent?.slug).toContain('cat-');
    expect(await client.shopVisible('LATE_CHILD')).toBe(false);
    await awaitOwner('register LATE_PARENT for sending', () => client.shopVisible('LATE_PARENT'));
    await pollUntil('child visible', () => client.shopVisible('LATE_CHILD'));
    expect(await client.shopVisible('LATE_PARENT')).toBe(true);
});

test('parent change moves the category under the new parent', async () => {
    const fromSlug = `cat-${feedId('MOVE_FROM')}`;
    const toSlug = `cat-${feedId('MOVE_TO')}`;
    expect((await client.admin('MOVE_CHILD'))?.parent?.slug).toBe(fromSlug);
    await awaitOwner(
        'change the parent of MOVE_CHILD from MOVE_FROM to MOVE_TO',
        async () => (await client.admin('MOVE_CHILD'))?.parent?.slug === toSlug,
    );
    expect(await client.shopVisible('MOVE_CHILD')).toBe(await client.shopVisible('MOVE_TO'));
});

// The ERP never sends category tombstones yet (1C issue #22, ut103-torg): the spec sends one via Integration Service ingestion.
test('tombstone hides the category and its children', async () => {
    expect(await client.shopVisible('TOMBSTONE')).toBe(true);
    expect(await client.shopVisible('TOMBSTONE_CHILD')).toBe(true);
    const before = await client.admin('TOMBSTONE');
    const childParent = (await client.admin('TOMBSTONE_CHILD'))?.parent?.slug;
    expect(childParent).toBe(`cat-${feedId('TOMBSTONE')}`);
    await sendCategoryTombstone('TOMBSTONE');
    await pollUntil('tombstone hidden', async () => !(await client.shopVisible('TOMBSTONE')));
    await pollUntil('child hidden', async () => !(await client.shopVisible('TOMBSTONE_CHILD')));
    const after = await client.admin('TOMBSTONE');
    expect(await client.ownFeedHidden('TOMBSTONE')).toBe(true);
    expect(after?.parent?.slug).toBe(before?.parent?.slug);
});
