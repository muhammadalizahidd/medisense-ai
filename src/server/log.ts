import "server-only";

/** The one place server code writes to the console. Never pass personal details or secrets. */
export function serverLog(message: string) {
  // eslint-disable-next-line no-console
  console.info(`[medisense] ${message}`);
}
