import { expect, test } from '@playwright/test';
import { ERP_DOCS, ERP_DOC_KINDS, ERP_DOC_PATHS } from '../../fixtures/erp-documents/plan';
import { clientName, type ActorKey, type ClientKey } from '../../fixtures/visibility/plan';
import { expectNotReceived, openManagerAs } from '../session';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

const CASES: { actor: ActorKey; visible: ClientKey[]; hidden: ClientKey[] }[] = [
    { actor: 'head-a', visible: ['a-own', 'a-free'], hidden: ['b-own'] },
    { actor: 'manager-b', visible: ['b-own'], hidden: ['a-own', 'a-free'] },
];

for (const { actor, visible, hidden } of CASES) {
    test.describe(`${actor} sees the documents of its own customers only`, () => {
        for (const kind of ERP_DOC_KINDS) {
            test(`${kind} list @read-only`, async ({ browser }) => {
                const s = await openManagerAs(browser, actor);
                try {
                    const own = ERP_DOCS[kind].filter(
                        d => d.client !== 'unknown' && visible.includes(d.client) && !d.deleted,
                    );
                    const others = ERP_DOCS[kind].filter(d => !own.includes(d));
                    await s.page.goto(ERP_DOC_PATHS[kind]);
                    await expect(s.page.locator(ROWS)).toHaveCount(own.length, { timeout: 15000 });
                    for (const d of own) await expect(s.page.getByText(d.number)).toBeVisible();
                    await expectNotReceived(s, [
                        ...others.map(d => d.number),
                        ...hidden.map(clientName),
                    ]);
                } finally {
                    await s.context.close();
                }
            });
        }
    });
}
