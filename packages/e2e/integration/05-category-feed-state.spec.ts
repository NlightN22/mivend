import { test, expect } from '@playwright/test';
import { feedClient, pollUntil, type FeedClient } from './category-feed';

test.describe.configure({ timeout: 15 * 60_000 });

let client: FeedClient;
test.beforeAll(async () => {
    client = await feedClient();
});

// The ERP feed sends isActive = NOT(deletion mark) and never isDeleted, so a deletion mark reads as feed-inactive.
test.describe('ERP deletion-marked parent', () => {
    test('children are hidden together with the deleted parent in admin and shop API', async () => {
        const parent = await client.admin('DELETED_PARENT');
        expect(await client.ownFeedHidden('DELETED_PARENT')).toBe(true);
        expect(parent?.isPrivate).toBe(true);
        await pollUntil(
            'child hidden',
            async () => (await client.admin('DELETED_PARENT_CHILD'))?.isPrivate === true,
        );
        const child = await client.admin('DELETED_PARENT_CHILD');
        expect(child?.parent?.isPrivate).toBe(true);
        expect(await client.ownFeedHidden('DELETED_PARENT_CHILD')).toBe(false);
        expect(await client.shopVisible('DELETED_PARENT')).toBe(false);
        expect(await client.shopVisible('DELETED_PARENT_CHILD')).toBe(false);
    });

    test('a manual visible override keeps the child reachable and is restored', async () => {
        const before =
            (await client.admin('DELETED_PARENT_CHILD'))?.customFields?.visibilityOverride ?? null;
        try {
            await client.setOverride('DELETED_PARENT_CHILD', 'visible');
            await pollUntil('child visible', () => client.shopVisible('DELETED_PARENT_CHILD'));
            expect(await client.shopVisible('DELETED_PARENT')).toBe(false);
        } finally {
            await client.setOverride('DELETED_PARENT_CHILD', before as 'visible' | 'hidden' | null);
        }
        await pollUntil(
            'override restored',
            async () => !(await client.shopVisible('DELETED_PARENT_CHILD')),
        );
        expect(
            (await client.admin('DELETED_PARENT_CHILD'))?.customFields?.visibilityOverride ?? null,
        ).toBe(before);
    });
});

test.describe('inactive flag (deletion mark on the feed)', () => {
    test('an inactive category is feed-hidden and its live child follows it', async () => {
        const row = await client.admin('INACTIVE');
        expect(await client.ownFeedHidden('INACTIVE')).toBe(true);
        expect(row?.isPrivate).toBe(true);
        await pollUntil(
            'inactive child hidden',
            async () => (await client.admin('INACTIVE_CHILD'))?.isPrivate === true,
        );
        expect(await client.shopVisible('INACTIVE')).toBe(false);
        expect(await client.shopVisible('INACTIVE_CHILD')).toBe(false);
    });
});
