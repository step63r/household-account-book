import { ZodError } from 'zod';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse } from './response';

/** An error that should be surfaced to the caller with a specific HTTP status code. */
export class HttpError extends Error {
  readonly statusCode: number;
  /** Machine-readable code so the frontend can branch on error type without parsing `message`. */
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/**
 * Central error -> HTTP response mapping for handlers. Keep this the single place that
 * decides status codes so every handler behaves consistently for the frontend.
 */
export function handleError(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof ZodError) {
    return jsonResponse(400, {
      message: 'Validation failed',
      issues: error.issues,
    });
  }
  if (error instanceof HttpError) {
    return jsonResponse(error.statusCode, { message: error.message, code: error.code });
  }

  // Unexpected error: log full detail server-side, don't leak internals to the caller.
  console.error('Unhandled error in handler', error);
  return jsonResponse(500, { message: 'Internal server error' });
}
