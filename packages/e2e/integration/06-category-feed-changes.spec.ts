import { test, expect } from '@playwright/test';
import { awaitOwner, feedClient, feedId, pollUntil, type FeedClient } from './category-feed';

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
    expect((await client.admin('REVIVE_FEED_HIDDEN_CHILD'))?.customFields?.feedHidden).toBe(true);
});

test('parent arriving after its child: placeholder first, then filled in', async () => {
    const placeholder = await client.admin('LATE_PARENT');
    expect(placeholder?.customFields?.feedHidden).toBe(true);
    expect((await client.admin('LATE_CHILD'))?.parent?.slug).toContain('cat-');
    expect(await client.shopVisible('LATE_CHILD')).toBe(false);
    await awaitOwner(
        'register LATE_PARENT for sending',
        async () => (await client.admin('LATE_PARENT'))?.customFields?.feedHidden === false,
    );
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

// Blocked: the ERP never sends category tombstones; only a direct Integration Service entities/delete call can,
// and its request body and key scope are undocumented (see docs/e2e-testing.md).
test.fixme('tombstone hides the category and its children', async () => {
    expect(await client.shopVisible('TOMBSTONE')).toBe(true);
    expect(await client.shopVisible('TOMBSTONE_CHILD')).toBe(true);
    await pollUntil('tombstone hidden', async () => !(await client.shopVisible('TOMBSTONE')));
    await pollUntil('child hidden', async () => !(await client.shopVisible('TOMBSTONE_CHILD')));
    expect((await client.admin('TOMBSTONE'))?.customFields?.feedHidden).toBe(true);
});
