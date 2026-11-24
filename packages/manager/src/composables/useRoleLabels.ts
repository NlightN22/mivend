import { useI18n } from 'vue-i18n';
import { KNOWN_ROLE_CODES } from '../api/settings';

type KnownRoleCode = (typeof KNOWN_ROLE_CODES)[number];

const isKnown = (code: string): code is KnownRoleCode =>
    (KNOWN_ROLE_CODES as readonly string[]).includes(code);

// Default roles are translated here by code; a custom role keeps its own code and description.
export function useRoleLabels(): {
    roleName: (code: string) => string;
    roleDescription: (code: string, fallback: string) => string;
} {
    const { t } = useI18n();
    return {
        roleName: code => (isKnown(code) ? t(`roleLabels.${code}.name`) : code),
        roleDescription: (code, fallback) =>
            isKnown(code) ? t(`roleLabels.${code}.description`) : fallback,
    };
}
