export function brandOf(manufacturer: { name?: string | null } | null | undefined): string {
    return manufacturer?.name ?? '';
}
