import { Response } from 'express';

export function handleApiError(
  res: Response,
  err: any,
  fallbackMessage: string = '요청 처리 중 서버 오류가 발생했습니다.',
  statusCode: number = 500
) {
  // Always log detailed stack trace or error message internally for debugging
  console.error(`[API ERROR] ${fallbackMessage}:`, err?.stack || err?.message || err);

  // Return a clean, user-facing error message without exposing internal stack traces or code details
  let rawMsg = typeof err === 'string' ? err : err?.message;
  const clientMessage =
    typeof rawMsg === 'string' &&
    rawMsg.trim().length > 0 &&
    !rawMsg.includes('at ') &&
    !rawMsg.includes('/node_modules/') &&
    !rawMsg.includes('\\node_modules\\')
      ? rawMsg
      : fallbackMessage;

  return res.status(statusCode).json({
    error: clientMessage,
  });
}
