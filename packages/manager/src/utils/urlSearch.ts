// Filters with the URL's search applied, or null when it already matches (stops URL <-> state loops).
export function withUrlSearch<T extends { search: string }>(
    filters: T,
    urlSearch: unknown,
): T | null {
    const search = typeof urlSearch === 'string' ? urlSearch : '';
    return search === filters.search ? null : { ...filters, search };
}

// Searches typed in the list itself whose router.replace may still be resolving.
// A late route update carrying one of them is the list's own echo, not an outside navigation.
export function createOwnSearchTracker(): {
    typed: (search: string) => void;
    isOwnEcho: (urlSearch: unknown) => boolean;
    reset: () => void;
} {
    let pending: string[] = [];
    return {
        typed: search => {
            pending.push(search);
        },
        isOwnEcho: urlSearch => {
            const search = typeof urlSearch === 'string' ? urlSearch : '';
            const index = pending.indexOf(search);
            if (index < 0) return false;
            pending = pending.slice(index + 1);
            return true;
        },
        reset: () => {
            pending = [];
        },
    };
}
