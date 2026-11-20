export interface LegalRequisites {
    platformName: string;
    operatorName: string;
    operatorStatus: string;
    contactEmail: string;
    portalUrl: string;
    jurisdiction: string;
}

export const REQUISITE_KEYS = [
    'platformName',
    'operatorName',
    'operatorStatus',
    'contactEmail',
    'portalUrl',
    'jurisdiction',
] as const satisfies readonly (keyof LegalRequisites)[];

export function missingRequisites(requisites: Partial<LegalRequisites>): string[] {
    return REQUISITE_KEYS.filter(key => !requisites[key]?.trim());
}

export interface RenderValues {
    version: string;
    effectiveDate: Date;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function formatDate(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${date.getUTCFullYear()}`;
}

// An unknown placeholder is a template bug, never published as literal text.
export function renderTemplate(
    template: string,
    requisites: LegalRequisites,
    values: RenderValues,
): string {
    const lookup: Record<string, string> = {
        ...requisites,
        version: values.version,
        effectiveDate: formatDate(values.effectiveDate),
    };
    return template.replace(PLACEHOLDER, (_match, name: string) => {
        const value = lookup[name];
        if (value === undefined) throw new Error(`Unknown legal template placeholder: ${name}`);
        return value;
    });
}
