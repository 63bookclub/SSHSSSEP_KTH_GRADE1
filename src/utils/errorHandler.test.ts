import { describe, test, expect, jest } from 'bun:test';
import { handleApiError, sendApiError } from './errorHandler.ts';

describe('Centralized API Error Handler', () => {
  test('sendApiError returns standardized JSON response with error message', () => {
    let statusCodeSent = 0;
    let jsonSent: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCodeSent = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonSent = data;
        return mockRes;
      },
    };

    sendApiError(mockRes, 400, '잘못된 요청 파라미터입니다.');

    expect(statusCodeSent).toBe(400);
    expect(jsonSent).toEqual({ error: '잘못된 요청 파라미터입니다.' });
  });

  test('handleApiError catches exception and returns user-friendly error response', () => {
    let statusCodeSent = 0;
    let jsonSent: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCodeSent = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonSent = data;
        return mockRes;
      },
    };

    const err = new Error('특정 입력값 파싱 실패');
    handleApiError(mockRes, err, '기본 처리 오류', 400);

    expect(statusCodeSent).toBe(400);
    expect(jsonSent).toEqual({ error: '특정 입력값 파싱 실패' });
  });

  test('handleApiError uses fallback message when internal stack trace is in message', () => {
    let statusCodeSent = 0;
    let jsonSent: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCodeSent = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonSent = data;
        return mockRes;
      },
    };

    const err = new Error('Internal crash at /node_modules/some-lib/index.js');
    handleApiError(mockRes, err, '서버 내부에 오류가 발생했습니다.', 500);

    expect(statusCodeSent).toBe(500);
    expect(jsonSent).toEqual({ error: '서버 내부에 오류가 발생했습니다.' });
  });
});
