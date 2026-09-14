import { describe, it, expect, vi } from 'vitest';
import { setCategoryVisibilityOverride } from '../../api/categoryVisibility';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: setCategoryVisibilityOverride's isPrivate derivation — a HIGH finding from
//   mivend.audit.90 caught that clearing the override (visibilityOverride: null, "Auto (follow
//   feed)" in the UI) sent `isPrivate: null` in the updateCollection mutation's variables.
//   Collection.isPrivate is a non-nullable boolean column; Vendure's patchEntity treats an
//   explicit `null` variable as "set this field to null" (distinct from `undefined`, left
//   untouched), so this would fail the mutation against the non-nullable column instead of
//   leaving isPrivate alone for the next feed event to resolve, as the comment above the
//   function always intended.
// - Business invariants: 'hidden' -> isPrivate: true, 'visible' -> isPrivate: false, null ->
//   isPrivate key OMITTED from the mutation variables entirely (not sent as null/undefined
//   value — genuinely absent from the JSON body), since `JSON.stringify` only drops an
//   `undefined`-valued key, and the caller must never construct the object with the key present.
// - Data ownership and scope: single Collection, no cross-branch scope — same as the handler.
// - Failure modes: this is the actual failure mode under test — a wrong variable shape reaching
//   the server would surface as a save/constraint error there, never a TS type error, since the
//   generated mutation variables type marks isPrivate optional.
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply — this
//   is a pure client-side request-shaping function, no CQRS/inbox/outbox/concurrency involved.
// - Test placement: unit only, asserting the actual JSON body sent to fetch — a type-level check
//   alone would not have caught this (the bug shipped with `make lint`/`make test`/type-check
//   all green).
// - Existing coverage reused: mocks `fetch` the same way client.test.ts does for adminApi.
// - Deliberate omissions: none for this function — the whole point is the exact wire shape.

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

    // The HIGH finding: clearing the override must never send isPrivate at all — Collection's
    // isPrivate column is non-nullable, so an explicit null there is a save-time failure, not a
    // no-op.
    it('omits isPrivate entirely when clearing the override back to Auto', async () => {
        const { getBody } = mockFetchCapturingBody();
        await setCategoryVisibilityOverride('19', null);
        const variables = getBody().variables;
        expect(variables.visibilityOverride).toBeNull();
        expect('isPrivate' in variables).toBe(false);
    });
});
