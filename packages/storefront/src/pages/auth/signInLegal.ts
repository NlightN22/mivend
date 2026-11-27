import { useLegalStore } from '../../stores/legal';

// The server decides after the credentials are accepted; a failed status read never blocks a sign-in.
export async function needsLegalConfirmation(customerId: string): Promise<boolean> {
    const legal = useLegalStore();
    try {
        await legal.load(customerId);
    } catch {
        return false;
    }
    return legal.blocking;
}
