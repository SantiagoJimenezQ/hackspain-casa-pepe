/** Final JSON/public content and tool arguments remain bounded to 1 MiB. */
export const MAXIMUM_RESPONSE_BYTES = 1024 * 1024
/** SSE repeats an envelope per token and can include discarded private reasoning. */
export const MAXIMUM_STREAM_BYTES = 16 * MAXIMUM_RESPONSE_BYTES
