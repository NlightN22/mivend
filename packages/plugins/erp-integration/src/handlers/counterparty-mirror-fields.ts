import type { ActiveStateFields } from '@mivend/plugin-counterparty';
import type { CounterpartyMirrorFields } from '@mivend/plugin-counterparty';

const json = (value: unknown): string | undefined =>
    value === undefined ? undefined : JSON.stringify(value);

// Exactly what the event carried (undefined = not sent), keyed the way the mirror names it.
export function mirrorFields(
    fields: ActiveStateFields,
    managerIds: unknown,
): CounterpartyMirrorFields {
    return {
        name: fields.name,
        fullName: fields.fullName,
        inn: fields.inn,
        kpp: fields.kpp,
        ogrnip: fields.ogrnip,
        okpo: fields.okpo,
        legalType: fields.legalType,
        legalFormId: fields.legalFormId,
        regionId: fields.regionId,
        managerId: fields.managerErpId,
        managerIds: Array.isArray(managerIds) ? json(managerIds) : undefined,
    };
}
