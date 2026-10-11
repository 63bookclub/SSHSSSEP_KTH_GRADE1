import { Response } from 'express';

export function handleApiError(
  res: Response,
  err: any,
  fallbackMessage: string = '요청 처리 중 서버 오류가 발생했습니다.',
  statusCode?: number
) {
  const actualStatus = statusCode || err?.status || err?.statusCode || 500;

  // Internal log for debugging
  console.error(`[API ERROR] ${fallbackMessage}:`, err?.stack || err?.message || err);

  let clientMessage = fallbackMessage;
  if (typeof err === 'string' && err.trim().length > 0) {
    clientMessage = err;
  } else if (typeof err?.message === 'string' && !err.message.includes('at ') && !err.message.includes('/node_modules/')) {
    clientMessage = err.message;
  }

  return res.status(actualStatus).json({
    error: clientMessage,
  });
}
