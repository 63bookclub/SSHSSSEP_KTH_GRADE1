import { Response } from 'express';

export function handleApiError(
  res: Response,
  err: any,
  fallbackMessage: string = '요청 처리 중 서버 오류가 발생했습니다.',
  statusCode: number = 500
) {
  // Always log detailed stack trace or error message internally for debugging
  console.error(`[API ERROR] ${fallbackMessage}:`, err?.stack || err?.message || err);

  let clientMessage = fallbackMessage;

  if (typeof err === 'string' && err.trim().length > 0) {
    clientMessage = err.trim();
  } else if (
    typeof err?.message === 'string' &&
    err.message.trim().length > 0 &&
    !err.message.includes('at ') &&
    !err.message.includes('/node_modules/')
  ) {
    clientMessage = err.message.trim();
  }

  return res.status(statusCode).json({
    error: clientMessage,
  });
}
