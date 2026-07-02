import { ref } from 'vue';

type ViewMode = 'list' | 'grid';

const STORAGE_KEY = 'preferred-view-mode';
const DEFAULT: ViewMode = 'list';

function read(): ViewMode {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'grid' || v === 'list' ? v : DEFAULT;
}

// Module-level ref so all composable instances stay in sync within a session
const viewMode = ref<ViewMode>(read());

export function useViewMode() {
    function setViewMode(mode: ViewMode) {
        viewMode.value = mode;
        localStorage.setItem(STORAGE_KEY, mode);
    }

    return { viewMode, setViewMode };
}
