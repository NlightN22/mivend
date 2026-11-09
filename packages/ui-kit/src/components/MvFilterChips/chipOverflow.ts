export const MAX_INLINE_CHIPS = 6;

// Many chips would wrap onto several lines; they become one scrollable row with fade edges.
export function shouldCollapseChips(count: number, max: number = MAX_INLINE_CHIPS): boolean {
    return count > max;
}
