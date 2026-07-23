import { HttpError } from './errors';

/** Parses an API Gateway HTTP API v2 event body as JSON, throwing a 400 HttpError on failure. */
export function parseJsonBody(body: string | undefined): unknown {
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}
