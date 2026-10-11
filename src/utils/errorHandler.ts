import { Response } from 'express';

export interface ApiErrorResponse {
  error: string;
}

/**
 * Returns a standardized JSON error response with status code and Korean error message.
 */
export function sendApiError(
  res: Response,
  statusCode: number,
  message: string
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    error: message,
  });
}

/**
 * Handles uncaught errors or exceptions in API routes, returning a standardized { error: string } response.
 */
export function handleApiError(
  res: Response,
  err: any,
  fallbackMessage: string = '요청 처리 중 서버 오류가 발생했습니다.',
  statusCode: number = 500
): Response<ApiErrorResponse> {
  // Always log detailed stack trace or error message internally for debugging
  console.error(`[API ERROR] ${fallbackMessage}:`, err?.stack || err?.message || err);

  // Return a clean, user-facing error message without exposing internal stack traces or code details
  const clientMessage =
    typeof err === 'string'
      ? err
      : typeof err?.message === 'string' &&
        !err.message.includes('at ') &&
        !err.message.includes('/node_modules/')
      ? err.message
      : fallbackMessage;

  return sendApiError(res, statusCode, clientMessage);
}
