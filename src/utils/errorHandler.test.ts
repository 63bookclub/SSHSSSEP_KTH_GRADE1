import { describe, test, expect, mock } from 'bun:test';
import { handleApiError } from './errorHandler.ts';

describe('handleApiError Utility', () => {
  function createMockResponse() {
    const res: any = {};
    res.status = mock((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json = mock((data: any) => {
      res.jsonData = data;
      return res;
    });
    return res;
  }

  test('should return status code and error json object with error string', () => {
    const res = createMockResponse();
    const err = new Error('유효하지 않은 PDB ID입니다.');

    handleApiError(res, err, '서버 오류', 400);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toEqual({ error: '유효하지 않은 PDB ID입니다.' });
  });

  test('should use fallback message when error message is invalid or stack trace', () => {
    const res = createMockResponse();
    const err = new Error('Error at /node_modules/express/index.js');

    handleApiError(res, err, '기본 처리 오류 메시지', 500);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData).toEqual({ error: '기본 처리 오류 메시지' });
  });

  test('should handle string error input', () => {
    const res = createMockResponse();

    handleApiError(res, '체인 ID를 찾을 수 없습니다.', '기본 오류', 404);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData).toEqual({ error: '체인 ID를 찾을 수 없습니다.' });
  });
});
