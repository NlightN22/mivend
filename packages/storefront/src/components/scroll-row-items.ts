// The list is doubled for the endless wrap only when there are arrows to wrap with.
export function scrollRowItems<T>(items: T[], visible: number): T[] {
    return items.length > visible ? [...items, ...items] : items;
}
