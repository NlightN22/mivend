import { adminGql } from './api';

export async function deleteCustomerByEmail(email: string, adminToken: string): Promise<void> {
    const found = await adminGql<{ customers: { items: Array<{ id: string }> } }>(
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: email },
        adminToken,
    );
    for (const { id } of found.data.customers.items) {
        await adminGql(
            `mutation($id: ID!) { deleteCustomer(id: $id) { result } }`,
            { id },
            adminToken,
        );
    }
}
