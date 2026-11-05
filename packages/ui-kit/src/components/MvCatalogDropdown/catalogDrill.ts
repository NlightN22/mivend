import type { CollectionNode } from './MvCatalogDropdownGroup.vue';

export interface DrillLevel {
    trail: CollectionNode[];
    items: CollectionNode[];
}

// Walks `path` (collection ids) down the tree; an id that no longer exists truncates the path there.
export function resolveDrill(collections: CollectionNode[], path: string[]): DrillLevel {
    const trail: CollectionNode[] = [];
    let items = collections;
    for (const id of path) {
        const next = items.find(c => c.id === id);
        if (!next) break;
        trail.push(next);
        items = next.children;
    }
    return { trail, items };
}
