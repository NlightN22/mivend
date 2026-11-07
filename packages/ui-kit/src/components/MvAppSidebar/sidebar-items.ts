export interface AppSidebarItem {
    label: string;
    path?: string;
    badgeCount?: number;
    children?: AppSidebarItem[];
}

export function isPathActive(current: string, path: string): boolean {
    return current === path || (path !== '/' && current.startsWith(`${path}/`));
}

export function isGroupActive(current: string, group: AppSidebarItem): boolean {
    return (group.children ?? []).some(child => child.path && isPathActive(current, child.path));
}

export function groupBadgeCount(group: AppSidebarItem): number {
    return (group.children ?? []).reduce((sum, child) => sum + (child.badgeCount ?? 0), 0);
}
