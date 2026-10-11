export function isNotRegisteredInErp(
    fields:
        | { erpRegistrationStatus?: string | null; erpRegistrationDocumentNumber?: string | null }
        | null
        | undefined,
): boolean {
    return !fields?.erpRegistrationStatus && !fields?.erpRegistrationDocumentNumber;
}
