import { adminGql, postBatch, waitForRun } from '../helpers/api';
import { MANAGER_ACCOUNTS } from './accounts';
import { pickerSeedRecords } from './seed-picker';

const PICKER_BATCH_SIZE = 100;

export async function seedPicker(adminToken: string): Promise<void> {
    const started = Date.now();
    // Many records: sent in chunks so no single request exceeds the server body limit.
    for (let i = 0; i < pickerSeedRecords.length; i += PICKER_BATCH_SIZE) {
        const chunkId = `e2e-seed-picker-${i}-${Date.now()}`;
        await postBatch(chunkId, pickerSeedRecords.slice(i, i + PICKER_BATCH_SIZE));
        await waitForRun(chunkId);
    }
    console.log(`e2e picker seed: ${Math.round((Date.now() - started) / 1000)}s`);

    // The own-scope manager role sees only counterparties assigned to it; the picker spec runs for that role too.
    const manager = await adminGql<{ administrators: { items: { id: string }[] } }>(
        `query($email: String!) { administrators(options: { filter: { emailAddress: { eq: $email } } }) { items { id } } }`,
        { email: MANAGER_ACCOUNTS.manager.username },
        adminToken,
    );
    const counterparties = await adminGql<{ counterparties: { items: { id: string }[] } }>(
        `query($s: String) { counterparties(options: { search: $s, take: 20 }) { items { id } } }`,
        { s: 'Zzz Picker' },
        adminToken,
    );
    for (const { id } of counterparties.data.counterparties.items) {
        await adminGql(
            `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
            { c: id, a: manager.data.administrators.items[0].id },
            adminToken,
        );
    }
}
