import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staffToken } from '../harness/actors';
import { saleContractName } from '../seed/fixture-plan';

const CONTRACTS = `query($c: ID!) { counterpartyContracts(counterpartyId: $c) { items { id name files { uuid downloadUrl } } } }`;
const UPLOAD = `mutation($c: ID!, $k: String!, $f: Upload!) { uploadContractFile(contractId: $c, kind: $k, file: $f) { uuid downloadUrl } }`;
const DELETE = `mutation($u: String!) { deleteContractFile(uuid: $u) }`;
const MY_FILES = `query { myContractFiles(take: 50) { totalItems items { uuid downloadUrl } } }`;

interface Contract {
    id: string;
    name: string;
    files: { uuid: string; downloadUrl: string }[];
}

async function upload(token: string, contractId: string, kind: string): Promise<string[]> {
    const form = new FormData();
    form.append(
        'operations',
        JSON.stringify({ query: UPLOAD, variables: { c: contractId, k: kind, f: null } }),
    );
    form.append('map', JSON.stringify({ '0': ['variables.f'] }));
    form.append('0', new Blob(['%PDF-1.4 scan'], { type: 'application/pdf' }), 'scan.pdf');
    const response = await fetch(`${inject('accessBaseUrl')}/admin-api`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'apollo-require-preflight': 'true' },
        body: form,
    });
    const body = (await response.json()) as {
        data?: { uploadContractFile: { uuid: string } } | null;
        errors?: { message: string }[];
    };
    return body.errors?.map(e => e.message) ?? [body.data!.uploadContractFile.uuid];
}

async function saleContract(token: string, counterparty: string): Promise<Contract> {
    const result = await admin<{ counterpartyContracts: { items: Contract[] } }>(token, CONTRACTS, {
        c: counterparty,
    });
    expect(result.errors).toEqual([]);
    return result.data!.counterpartyContracts.items.find(
        c => c.name === saleContractName('a-own'),
    )!;
}

describe('contract files', () => {
    let director: string;
    let managerA: string;
    let operator: string;
    let managerB: string;
    let contract: Contract;
    let uuid: string;

    beforeAll(async () => {
        director = await staffToken('director');
        managerA = await staffToken('manager-a');
        operator = await staffToken('operator-a');
        managerB = await staffToken('manager-b');
        contract = await saleContract(director, seed().counterparties['a-own']);
        const [uploaded] = await upload(managerA, contract.id, 'scan');
        uuid = uploaded;
    });

    afterAll(async () => {
        await admin(director, DELETE, { u: uuid });
    });

    it('lets a manager of the client upload and see the file', async () => {
        expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
        const seen = await saleContract(managerA, seed().counterparties['a-own']);
        expect(seen.files.map(f => f.uuid)).toContain(uuid);
    });

    it('refuses an upload without the right', async () => {
        const [message] = await upload(operator, contract.id, 'other');
        expect(message).toMatch(DENIED);
    });

    it('refuses an upload for a contract of a client the manager does not see', async () => {
        const [message] = await upload(managerB, contract.id, 'other');
        expect(message).toMatch(/not found/i);
    });

    it('shows no contracts of a hidden client', async () => {
        const result = await admin<{ counterpartyContracts: { items: Contract[] } }>(
            managerB,
            CONTRACTS,
            { c: seed().counterparties['a-own'] },
        );
        expect(result.data?.counterpartyContracts.items).toEqual([]);
    });

    it('serves the file to its customer only', async () => {
        const own = await shop<{ myContractFiles: { items: { uuid: string }[] } }>(
            await customerToken('customer-a'),
            MY_FILES,
        );
        expect(own.data!.myContractFiles.items.map(f => f.uuid)).toContain(uuid);
        const other = await shop<{ myContractFiles: { items: { uuid: string }[] } }>(
            await customerToken('customer-b'),
            MY_FILES,
        );
        expect(other.data!.myContractFiles.items.map(f => f.uuid)).not.toContain(uuid);
    });

    it('downloads for the owner, 404 for another customer, a hidden staff member and a guest', async () => {
        const url = `${inject('accessBaseUrl')}/contract-file/${uuid}`;
        const get = (token?: string): Promise<Response> =>
            fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
        expect((await get(await customerToken('customer-a'))).status).toBe(200);
        expect((await get(managerA)).status).toBe(200);
        expect((await get(await customerToken('customer-b'))).status).toBe(404);
        expect((await get(managerB)).status).toBe(404);
        expect((await get()).status).toBe(404);
    });
});
