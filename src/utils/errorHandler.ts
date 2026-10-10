import { Response } from 'express';

/**
 * Standardized API Error Handler for Express backend endpoints.
 * Guarantees uniform JSON error structure `{ error: string }` and clean Korean error messages.
 */
export function handleApiError(
  res: Response,
  err: any,
  fallbackMessage: string = '요청 처리 중 서버 오류가 발생했습니다.',
  statusCode: number = 500
) {
  // Log detailed error information for internal debugging
  console.error(`[API ERROR] ${fallbackMessage}:`, err?.stack || err?.message || err);

  let rawMessage = '';
  if (typeof err === 'string') {
    rawMessage = err;
  } else if (err && typeof err.message === 'string') {
    rawMessage = err.message;
  }

  let clientMessage = fallbackMessage;

  if (rawMessage) {
    // Map common system/Express errors to user-friendly Korean messages
    if (rawMessage.includes('request entity too large') || err?.type === 'entity.too.large') {
      clientMessage = '요청 데이터 크기가 허용된 제한을 초과했습니다.';
    } else if (err instanceof SyntaxError && 'body' in err) {
      clientMessage = '잘못된 JSON 요청 형식입니다.';
    } else if (rawMessage.includes('CORS') || rawMessage.includes('Not allowed by CORS')) {
      clientMessage = 'CORS 정책에 의해 허용되지 않은 출처입니다.';
    } else if (!rawMessage.includes('at ') && !rawMessage.includes('/node_modules/') && !rawMessage.includes('Error:')) {
      clientMessage = rawMessage;
    } else {
      clientMessage = fallbackMessage;
    }
  }

  // Ensure appropriate status code for specific error types
  let finalStatusCode = statusCode;
  if (err?.type === 'entity.too.large') {
    finalStatusCode = 413;
  } else if (err instanceof SyntaxError && 'body' in err) {
    finalStatusCode = 400;
  }

  return res.status(finalStatusCode).json({
    error: clientMessage,
  });
}
