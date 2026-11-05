export interface LogoutFlowDeps {
    setGuard: () => void;
    logout: () => Promise<void>;
    navigate: () => void;
    timeoutMs?: number;
}

// Guard first so a surviving server session is ignored; navigation happens even if logout fails or hangs.
export async function runLogout(deps: LogoutFlowDeps): Promise<void> {
    deps.setGuard();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
        timer = setTimeout(resolve, deps.timeoutMs ?? 1500);
    });
    try {
        await Promise.race([deps.logout(), timeout]);
    } catch {
        // the guard and the hard navigation below already cover a failed request
    } finally {
        clearTimeout(timer);
        deps.navigate();
    }
}
