import { expect, test } from '@playwright/test';
import { adminCall, superadminToken } from './price-type-access';
import { actorCredentials, actorState, actorToken, ACTORS, type ActorKey } from './branch-actors';
import { openManagerAs } from './branch-pages';
import { orderOnPlainPoint, pointOverride } from './order-scope';
import { ACTIVE, DENIED, DETAILS, read } from './trading-point-queries';
import { pointRow } from './trading-point-scope';
import {
    COMMENT,
    COUNTERPARTY_PORTAL,
    ORDER_PORTAL,
    counterpartyById,
    counterpartyOfPoint,
    ids,
    listedPointIds,
    orderCounterparty,
    portalUsers,
    type Cp,
} from './servicing-scope';

const OVERRIDE = `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`;
const HEADS: ActorKey[] = ['head-a', 'head-b'];
const branchOf = (key: ActorKey): string =>
    actorState(ACTORS.find(a => a.key === key)!).branchId as string;

let superadmin: string;
let order: ReturnType<typeof orderOnPlainPoint>;
let cpId: string;
let owner: ActorKey;
let servicing: ActorKey;
let full: Cp;

test.describe.configure({ mode: 'serial' });

test.describe('20: a trading point serviced by another branch', () => {
    test.beforeAll(async () => {
        test.skip(
            HEADS.some(k => !actorCredentials(k)),
            'a head login is not set',
        );
        order = orderOnPlainPoint();
        const home = HEADS.find(k => branchOf(k) === order.branchId);
        const other = HEADS.find(k => branchOf(k) !== order.branchId);
        test.skip(!home || !other, 'the order counterparty belongs to neither head branch');
        owner = home!;
        servicing = other!;
        expect(pointOverride(order.pointId), 'the point starts without an override').toBeNull();
        cpId = counterpartyOfPoint(order.pointId);
        superadmin = await superadminToken();
        const set = await adminCall(superadmin, OVERRIDE, {
            id: order.pointId,
            b: branchOf(servicing),
        });
        expect(set.errors).toEqual([]);
        expect(pointOverride(order.pointId)).toBe(branchOf(servicing));
        full = (await counterpartyById(superadmin, cpId))!;
    });

    test.afterAll(async () => {
        if (!order || !superadmin) return;
        const reset = await adminCall(superadmin, OVERRIDE, { id: order.pointId, b: null });
        expect(reset.errors).toEqual([]);
        expect(pointOverride(order.pointId), 'the override is removed').toBeNull();
    });

    test('superadmin sees the order, the counterparty and all its points, team and users', async () => {
        const viaOrder = await orderCounterparty(superadmin, order.id);
        expect(viaOrder.errors).toEqual([]);
        expect(viaOrder.cp!.shortName).toBe(full.shortName);
        expect(ids(viaOrder.cp!.tradingPoints)).toContain(order.pointId);
        expect(ids(viaOrder.cp!.tradingPoints)).toEqual(ids(full.tradingPoints));
        expect(ids(viaOrder.cp!.teamMembers)).toEqual(ids(full.teamMembers));
        expect(viaOrder.cp!.linkedCustomerId).toBe(full.linkedCustomerId);
        expect(await read(superadmin, order.pointId)).not.toBeNull();
        expect((await portalUsers(superadmin, COUNTERPARTY_PORTAL, cpId)).errors).toBe('');
    });

    test('servicing head: the order and the point, but not the counterparty data', async () => {
        const token = await actorToken(servicing);
        const viaOrder = await orderCounterparty(token, order.id);
        expect(viaOrder.errors).toEqual([]);
        expect(viaOrder.cp, `${servicing} sees order ${order.code}`).not.toBeNull();
        expect(viaOrder.cp!.shortName, 'the customer name').toBe(full.shortName);
        expect(viaOrder.cp!.tradingPoints, 'no points').toEqual([]);
        expect(viaOrder.cp!.teamMembers, 'no team').toEqual([]);
        expect(viaOrder.cp!.linkedCustomerId, 'no linked customer').toBeNull();
        // A head without ManageCounterpartyPortalAccess is denied the field itself; that is accepted too.
        const users = await portalUsers(token, ORDER_PORTAL, order.id);
        if (users.errors) expect(users.errors).toMatch(DENIED);
        else expect(users.ids, 'no portal users').toEqual([]);
        expect(await read(token, order.pointId), 'reads the point by id').not.toBeNull();
        expect(await counterpartyById(token, cpId), 'no counterparty by id').toBeNull();
        const listed = await listedPointIds(token, full.shortName);
        expect(listed, 'the point is in no list').not.toContain(order.pointId);
        expect(listed, 'the counterparty is in no list').not.toContain(`cp:${cpId}`);
    });

    test('servicing head: point writes are denied and change nothing', async () => {
        const token = await actorToken(servicing);
        const before = pointRow(order.pointId);
        try {
            const writes = [
                await adminCall(token, DETAILS, {
                    id: order.pointId,
                    input: { deliveryComment: 'e2e-int probe' },
                }),
                await adminCall(token, ACTIVE, { id: order.pointId, a: !before.isActive }),
                await adminCall(token, COMMENT, { id: order.pointId, c: 'e2e-int probe' }),
            ];
            for (const w of writes) expect(w.errors.join(' ')).toMatch(DENIED);
            expect(pointRow(order.pointId), 'nothing was written').toEqual(before);
        } finally {
            const back = [
                await adminCall(superadmin, ACTIVE, { id: order.pointId, a: before.isActive }),
                await adminCall(superadmin, DETAILS, {
                    id: order.pointId,
                    input: { deliveryComment: before.deliveryComment },
                }),
            ];
            for (const r of back) expect(r.errors, 'restored by the superadmin').toEqual([]);
        }
        expect(pointRow(order.pointId), 'the row is as before').toEqual(before);
    });

    test('owner head: loses the order, keeps the counterparty and can edit the point', async () => {
        const token = await actorToken(owner);
        const viaOrder = await orderCounterparty(token, order.id);
        expect(viaOrder.cp, `${owner} loses order ${order.code}`).toBeNull();
        const cp = await counterpartyById(token, cpId);
        expect(cp, 'keeps the counterparty').not.toBeNull();
        expect(ids(cp!.tradingPoints)).toEqual(ids(full.tradingPoints));
        expect(ids(cp!.tradingPoints).length).toBeGreaterThan(0);
        expect(ids(cp!.teamMembers)).toEqual(ids(full.teamMembers));
        const mine = await portalUsers(token, COUNTERPARTY_PORTAL, cpId);
        const all = await portalUsers(superadmin, COUNTERPARTY_PORTAL, cpId);
        if (mine.errors) expect(mine.errors).toMatch(DENIED);
        else expect(mine.ids!.sort()).toEqual(all.ids!.sort());
        const before = pointRow(order.pointId);
        // updateTradingPointComment needs UpdateCustomer, which a head lacks; the portal edits through details.
        const edit = await adminCall(token, DETAILS, {
            id: order.pointId,
            input: { deliveryComment: before.deliveryComment },
        });
        expect(edit.errors, 'a no-op comment edit is allowed').toEqual([]);
        expect(pointRow(order.pointId)).toEqual(before);
    });

    test('manager portal: order card for the servicing head, customer card for the owner', async ({
        browser,
    }, testInfo) => {
        const shots = testInfo.outputPath('shots');
        const s = await openManagerAs(browser, servicing);
        try {
            await s.page.goto(`/orders/${order.code}`);
            await expect(s.page.getByText(full.shortName).first()).toBeVisible({ timeout: 15000 });
            await s.page.screenshot({ path: `${shots}/g20-servicing-order.png`, fullPage: true });
            await s.page.goto(`/customers/${cpId}`);
            await expect(s.page.getByText('Customer not found')).toBeVisible({ timeout: 15000 });
            await s.page.screenshot({
                path: `${shots}/g20-servicing-customer.png`,
                fullPage: true,
            });
        } finally {
            await s.context.close();
        }
        const o = await openManagerAs(browser, owner);
        try {
            await o.page.goto(`/customers/${cpId}`);
            await expect(o.page.getByText(pointRow(order.pointId).name).first()).toBeVisible({
                timeout: 15000,
            });
            await o.page.screenshot({ path: `${shots}/g20-owner-customer.png`, fullPage: true });
        } finally {
            await o.context.close();
        }
    });
});
