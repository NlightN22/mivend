import { describe, expect, it } from 'vitest';

import { LEGAL_TEMPLATES } from '../../templates';
import { missingRequisites, renderTemplate } from '../../requisites';

const requisites = {
    platformName: 'Portal',
    operatorName: 'Operator',
    operatorStatus: 'Sole proprietor',
    contactEmail: 'legal@example.com',
    contactAddress: 'Street 1',
    portalUrl: 'https://portal.example.com',
    jurisdiction: 'Country',
};
const values = { version: '1.0', effectiveDate: new Date('2026-11-19T10:00:00Z') };

describe('missingRequisites', () => {
    it('lists every empty or blank requisite', () => {
        expect(
            missingRequisites({ ...requisites, contactEmail: '  ', portalUrl: undefined }),
        ).toEqual(['contactEmail', 'portalUrl']);
        expect(missingRequisites(requisites)).toEqual([]);
    });
});

describe('renderTemplate', () => {
    it('substitutes requisites, version and effective date', () => {
        expect(
            renderTemplate(
                '{{operatorName}} v{{version}} from {{effectiveDate}}',
                requisites,
                values,
            ),
        ).toBe('Operator v1.0 from 19.11.2026');
    });

    it('rejects an unknown placeholder instead of publishing it', () => {
        expect(() => renderTemplate('{{nope}}', requisites, values)).toThrow(/nope/);
    });

    it.each(LEGAL_TEMPLATES.map(t => [`${t.kind}/${t.locale}`, t]))(
        'bundled template %s renders with no placeholder left',
        (_name, template) => {
            const text = renderTemplate(template.body, requisites, values);
            expect(text).not.toMatch(/\{\{|\[[А-ЯA-Z]{3,}/);
        },
    );
});
