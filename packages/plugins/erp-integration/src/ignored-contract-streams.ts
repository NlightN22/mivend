// Contract streams mivend deliberately does not consume — each needs a reason, otherwise the
// stream-health table and the drift unit test report it as an error.
export const IGNORED_CONTRACT_STREAMS: Readonly<Record<string, string>> = {};
