export const MAX_CHIP_ROWS = 2;

function rowsNeeded(widths: number[], containerWidth: number, gap: number): number {
    let rows = 1;
    let x = 0;
    for (const w of widths) {
        const next = x === 0 ? w : x + gap + w;
        if (x > 0 && next > containerWidth) {
            rows++;
            x = w;
        } else x = next;
    }
    return rows;
}

export interface ChipsFit {
    overflows: boolean;
    visible: boolean[];
}

// Chips flow into MAX_CHIP_ROWS rows; when they do not fit, the toggle takes the last slot and
// the active chip always stays visible.
export function fitChips(
    widths: number[],
    activeIndex: number,
    containerWidth: number,
    gap: number,
    toggleWidth: number,
): ChipsFit {
    const all = widths.map(() => true);
    if (rowsNeeded(widths, containerWidth, gap) <= MAX_CHIP_ROWS)
        return { overflows: false, visible: all };
    for (let k = widths.length - 1; k >= 0; k--) {
        const visible = widths.map((_, i) => i < k || i === activeIndex);
        const shown = widths.filter((_, i) => visible[i]);
        if (rowsNeeded([...shown, toggleWidth], containerWidth, gap) <= MAX_CHIP_ROWS)
            return { overflows: true, visible };
    }
    return { overflows: true, visible: widths.map((_, i) => i === activeIndex) };
}
