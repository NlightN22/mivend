import type { CaptchaRequirement } from '@mivend/ui-kit';
import { adminApi } from './client';
import { SignInCaptchaRequirementDocument } from './generated/graphql';

export async function fetchCaptchaRequirement(login: string): Promise<CaptchaRequirement> {
    const { signInCaptchaRequirement: r } = await adminApi(SignInCaptchaRequirementDocument, {
        login,
    });
    return { required: r.required, siteKey: r.siteKey };
}
