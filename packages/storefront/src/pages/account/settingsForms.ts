export interface ProfileForm {
    firstName: string;
    lastName: string;
    phoneNumber: string;
}

export interface PasswordForm {
    current: string;
    next: string;
    confirm: string;
}

export interface ProfileUpdateInput {
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
}

export function profileUpdateInput(form: ProfileForm): ProfileUpdateInput {
    return {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim() || null,
    };
}

export function passwordFormError(form: PasswordForm): string | null {
    if (!form.current || !form.next || !form.confirm) return 'settings.security.passwordRequired';
    if (form.next !== form.confirm) return 'settings.security.passwordMismatch';
    return null;
}

export function passwordChangeErrorCode(
    result: { success: boolean } | { errorCode: string },
): string | null {
    return 'errorCode' in result ? result.errorCode : null;
}
