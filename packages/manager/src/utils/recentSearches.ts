const MAX_RECENT = 6;

// <name>:<administratorId>, so clearPersonalUiState removes it on logout.
export function recentSearchesKey(administratorId: string): string {
    return `recent-searches:${administratorId}`;
}

export function addRecent(list: string[], query: string, max = MAX_RECENT): string[] {
    const value = query.trim();
    if (!value) return list;
    return [value, ...list.filter(item => item !== value)].slice(0, max);
}

export function removeRecent(list: string[], query: string): string[] {
    return list.filter(item => item !== query);
}

export function loadRecent(key: string): string[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed)
            ? parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT)
            : [];
    } catch {
        return [];
    }
}

export function saveRecent(key: string, list: string[]): void {
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch {
        // storage unavailable: recent queries just stay in memory
    }
}
