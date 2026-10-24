export interface CategoryPlan {
    erpId: string;
    parent: string | null;
    isActive?: boolean;
    isDeleted?: boolean;
    override?: 'hidden' | 'visible';
    visible: boolean;
}

// `vis-missing` is never sent: it becomes a placeholder Collection when `vis-orphan` arrives.
export const CATEGORY_PLAN: CategoryPlan[] = [
    { erpId: 'vis-root', parent: null, visible: true },
    { erpId: 'vis-a', parent: 'vis-root', visible: true },
    { erpId: 'vis-a1', parent: 'vis-a', visible: true },
    { erpId: 'vis-a2', parent: 'vis-a', override: 'hidden', visible: false },
    { erpId: 'vis-a2x', parent: 'vis-a2', visible: false },
    { erpId: 'vis-b', parent: 'vis-root', isActive: false, visible: false },
    { erpId: 'vis-b1', parent: 'vis-b', visible: false },
    { erpId: 'vis-b2', parent: 'vis-b', override: 'visible', visible: true },
    { erpId: 'vis-b2x', parent: 'vis-b2', visible: true },
    { erpId: 'vis-del', parent: null, isDeleted: true, visible: false },
    { erpId: 'vis-del-child', parent: 'vis-del', visible: false },
    { erpId: 'vis-off', parent: null, isActive: false, visible: false },
    { erpId: 'vis-orphan', parent: 'vis-missing', visible: false },
];

export const PLACEHOLDER_CATEGORY = 'vis-missing';
export const categorySlug = (erpId: string): string => `cat-${erpId}`;
export const categorySku = (erpId: string): string => `VIS-SKU-${erpId}`;
export const categoryProductSlug = (erpId: string): string => `vis-product-${erpId}`;
export const categoryName = (erpId: string): string => `Visibility ${erpId}`;

export function categoryRootOf(erpId: string): string {
    let current = CATEGORY_PLAN.find(c => c.erpId === erpId);
    while (current?.parent && CATEGORY_PLAN.some(c => c.erpId === current?.parent))
        current = CATEGORY_PLAN.find(c => c.erpId === current?.parent);
    return current?.erpId ?? erpId;
}
