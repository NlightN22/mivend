import { describe, it, expect, vi } from 'vitest';
import { setCategoryVisibilityOverride } from '../../api/categoryVisibility';

// Omit the isPrivate key (not null/undefined) when clearing: explicit null is written to a
// non-nullable column and fails; JSON.stringify drops only undefined-valued keys.

function jsonResponse(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as Response;
}

function mockFetchCapturingBody(): {
    fetchMock: ReturnType<typeof vi.fn>;
    getBody: () => { variables: Record<string, unknown> };
} {
    const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
            data: {
                updateCollection: {
                    id: '19',
                    name: 'Batteries',
                    slug: 'cat-cat-electrical-batteries',
                    isPrivate: false,
                    customFields: { visibilityOverride: null },
                },
            },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return {
        fetchMock,
        getBody: () => JSON.parse(fetchMock.mock.calls[0][1].body),
    };
}

describe('setCategoryVisibilityOverride', () => {
    it('sends isPrivate: true when setting the override to hidden', async () => {
        const { getBody } = mockFetchCapturingBody();
        await setCategoryVisibilityOverride('19', 'hidden');
        expect(getBody().variables).toMatchObject({
            visibilityOverride: 'hidden',
            isPrivate: true,
        });
    });

    it('sends isPrivate: false when setting the override to visible', async () => {
        const { getBody } = mockFetchCapturingBody();
        await setCategoryVisibilityOverride('19', 'visible');
        expect(getBody().variables).toMatchObject({
            visibilityOverride: 'visible',
            isPrivate: false,
        });
    });

    // Never send isPrivate when clearing the override: the column is non-nullable, so an explicit
    // null fails at save time instead of being a no-op.
    it('omits isPrivate entirely when clearing the override back to Auto', async () => {
        const { getBody } = mockFetchCapturingBody();
        await setCategoryVisibilityOverride('19', null);
        const variables = getBody().variables;
        expect(variables.visibilityOverride).toBeNull();
        expect('isPrivate' in variables).toBe(false);
    });
});
