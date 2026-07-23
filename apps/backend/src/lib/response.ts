import type { APIGatewayProxyResultV2 } from 'aws-lambda';

/**
 * Builds a JSON API Gateway HTTP API (v2) proxy response.
 * Pass `undefined` as body for a bodyless response (e.g. 204 No Content).
 */
export function jsonResponse(statusCode: number, body?: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
