export const BUYER_NAME_PLACEHOLDER = 'Название организации не указано';

export function resolveBuyerLegalName(fullName: string | null | undefined): string {
    return fullName?.trim() ? fullName : BUYER_NAME_PLACEHOLDER;
}
