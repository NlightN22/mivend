export function isNotRegisteredInErp(
    fields: { erpRegistrationStatus?: string | null } | null | undefined,
): boolean {
    return !fields?.erpRegistrationStatus;
}
