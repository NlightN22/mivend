export interface AdministratorName {
    firstName: string;
    lastName: string;
}

// ERP fullName is "Surname Name Patronymic"; firstName carries name + patronymic.
// Surname is assumed to be one token; a multi-word surname lands in firstName (format can't tell).
export function parseErpFullName(
    fullName: string | null | undefined,
    fallback: string,
): AdministratorName {
    const [surname, ...given] = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!surname) {
        return { firstName: fallback, lastName: '-' };
    }
    if (given.length === 0) {
        return { firstName: surname, lastName: '-' };
    }
    return { firstName: given.join(' '), lastName: surname };
}
