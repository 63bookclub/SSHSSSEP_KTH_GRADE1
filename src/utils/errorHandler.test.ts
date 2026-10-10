import { describe, test, expect, mock } from 'bun:test';
import { handleApiError } from './errorHandler.ts';

describe('API Error Handler (handleApiError)', () => {
  test('should return status code and JSON object with clean error message when Error instance is passed', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: any) => {
        jsonBody = body;
        return mockRes;
      },
    };

    handleApiError(mockRes, new Error('유효하지 않은 입력입니다.'), '기본 오류 메시지', 400);

    expect(statusCode).toBe(400);
    expect(jsonBody).toEqual({ error: '유효하지 않은 입력입니다.' });
  });

  test('should use string message directly when string error is passed', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: any) => {
        jsonBody = body;
        return mockRes;
      },
    };

    handleApiError(mockRes, '타겟 구조를 찾을 수 없습니다.', '기본 오류', 404);

    expect(statusCode).toBe(404);
    expect(jsonBody).toEqual({ error: '타겟 구조를 찾을 수 없습니다.' });
  });

  test('should fallback to default fallbackMessage when error message contains internal stack trace', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: any) => {
        jsonBody = body;
        return mockRes;
      },
    };

    handleApiError(mockRes, new Error('Internal error at /node_modules/express/lib/router'), '서버 내부 오류가 발생했습니다.', 500);

    expect(statusCode).toBe(500);
    expect(jsonBody).toEqual({ error: '서버 내부 오류가 발생했습니다.' });
  });
});
