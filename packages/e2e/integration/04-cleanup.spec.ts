import { test, expect } from '@playwright/test';
import { cancelRunOrders } from './run-cleanup';
import { readRun } from './run-state';

test.describe.configure({ timeout: 10 * 60_000 });

test('6: no active reservation and no pending outbox row remains for the run orders', async () => {
    test.skip(readRun().orders.length === 0, 'the run placed no order');
    expect(await cancelRunOrders()).toEqual([]);
});
