import { onMounted, ref, type Ref } from 'vue';
import { useActingStore } from '../stores/acting';
import { takeActingTicket } from '../utils/actingTicket';

export interface UseActingEntry {
    failed: Ref<boolean>;
}

export function useActingEntry(): UseActingEntry {
    const acting = useActingStore();
    const failed = ref(false);

    onMounted(async () => {
        const ticket = takeActingTicket();
        if (!ticket) {
            if (acting.isActing) window.location.replace('/');
            else failed.value = true;
            return;
        }
        try {
            await acting.exchange(ticket);
            window.location.replace('/');
        } catch {
            failed.value = true;
        }
    });

    return { failed };
}
