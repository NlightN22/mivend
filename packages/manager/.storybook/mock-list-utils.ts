// Slices/filters an in-memory dataset the same way the real server-side paginated resolvers do
// (see AGENTS.md's Pagination section), so changing filters/search/pagination in a Storybook
// canvas actually changes what renders instead of always returning the same static page.
export interface ListOptions {
    skip?: number;
    take?: number;
}

export function paginate<T>(
    items: T[],
    options: ListOptions | undefined,
): { items: T[]; totalItems: number } {
    const skip = options?.skip ?? 0;
    const take = options?.take ?? items.length;
    return { items: items.slice(skip, skip + take), totalItems: items.length };
}

export function includesCi(haystack: string | null | undefined, needle: string): boolean {
    return (haystack ?? '').toLowerCase().includes(needle.toLowerCase());
}
