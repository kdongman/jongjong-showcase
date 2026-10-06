/** Only an internal Booth route may survive an authentication redirect. */
export function safeBoothReturnPath(value: string | null | undefined): string {
  return value && /^\/booth(?:\/[0-9a-fA-F-]{36})?$/.test(value) ? value : '/booth';
}
