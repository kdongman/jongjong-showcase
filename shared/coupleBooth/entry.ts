export type ActiveBoothEntry = {
  sessionId: string;
  created: boolean;
};

type ActiveBoothEntryRow = {
  session_id: unknown;
  created: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidBoothSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export class InvalidBoothSessionIdError extends Error {
  constructor() {
    super('INVALID_BOOTH_SESSION_ID');
    this.name = 'InvalidBoothSessionIdError';
  }
}

/**
 * Normalizes the one explicit entry-RPC contract. PostgREST can represent a
 * scalar JSON result either directly or as a one-item array; all other shapes
 * are rejected before a route or API request can use the value.
 */
export function normalizeActiveBoothSessionResult(data: unknown): ActiveBoothEntry {
  const candidate = Array.isArray(data)
    ? data.length === 1 ? data[0] : null
    : data;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new InvalidBoothSessionIdError();
  }
  const row = candidate as ActiveBoothEntryRow;
  if (!isValidBoothSessionId(row.session_id) || typeof row.created !== 'boolean') {
    throw new InvalidBoothSessionIdError();
  }
  return { sessionId: row.session_id, created: row.created };
}

export function assertValidBoothSessionId(value: unknown): asserts value is string {
  if (!isValidBoothSessionId(value)) throw new InvalidBoothSessionIdError();
}
