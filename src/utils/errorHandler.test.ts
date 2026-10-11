import { describe, test, expect, mock } from 'bun:test';
import { handleApiError } from './errorHandler.ts';

describe('Centralized API Error Handler', () => {
  test('should return status code and json error response for Error object', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonBody = data;
        return mockRes;
      },
    };

    handleApiError(mockRes, new Error('테스트 오류 메시지'), '대체 오류 메시지', 400);

    expect(statusCode).toBe(400);
    expect(jsonBody).toEqual({ error: '테스트 오류 메시지' });
  });

  test('should fallback to fallbackMessage when error contains stack trace elements', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonBody = data;
        return mockRes;
      },
    };

    const internalError = new Error('Internal crash at /node_modules/some-lib/index.js');
    handleApiError(mockRes, internalError, '서버 내부 오류가 발생했습니다.', 500);

    expect(statusCode).toBe(500);
    expect(jsonBody).toEqual({ error: '서버 내부 오류가 발생했습니다.' });
  });

  test('should handle string error input directly', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonBody = data;
        return mockRes;
      },
    };

    handleApiError(mockRes, '직접 전달된 문자열 에러', '기본 메시지', 404);

    expect(statusCode).toBe(404);
    expect(jsonBody).toEqual({ error: '직접 전달된 문자열 에러' });
  });
});
