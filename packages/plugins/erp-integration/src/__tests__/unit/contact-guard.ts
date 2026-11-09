// Stand-in for ContactPointService.guarded: runs the step and reports no failure.
export const passthroughGuard = async (
    _ctx: unknown,
    _label: string,
    work: () => Promise<void>,
): Promise<string | null> => {
    await work();
    return null;
};
