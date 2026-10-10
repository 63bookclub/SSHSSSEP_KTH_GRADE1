import { describe, expect, it } from 'bun:test';
import { handleApiError } from './errorHandler.ts';

describe('API Error Handler (handleApiError)', () => {
  it('should return default Korean fallback message in JSON format for unknown internal errors', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedJson = data;
        return this;
      },
    };

    handleApiError(mockRes, new Error('Internal error at /node_modules/some-lib'));

    expect(capturedStatus).toBe(500);
    expect(capturedJson).toEqual({
      error: '요청 처리 중 서버 오류가 발생했습니다.',
    });
  });

  it('should return clean user message when explicit Error is passed', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedJson = data;
        return this;
      },
    };

    handleApiError(mockRes, new Error('지정된 target_id를 찾을 수 없습니다.'), '기본 메시지', 404);

    expect(capturedStatus).toBe(404);
    expect(capturedJson).toEqual({
      error: '지정된 target_id를 찾을 수 없습니다.',
    });
  });

  it('should format entity.too.large errors into HTTP 413 and Korean payload error message', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedJson = data;
        return this;
      },
    };

    const payloadErr = new Error('request entity too large');
    (payloadErr as any).type = 'entity.too.large';

    handleApiError(mockRes, payloadErr);

    expect(capturedStatus).toBe(413);
    expect(capturedJson).toEqual({
      error: '요청 데이터 크기가 허용된 제한을 초과했습니다.',
    });
  });

  it('should format SyntaxError body parsing errors into HTTP 400 and Korean JSON error message', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedJson = data;
        return this;
      },
    };

    const syntaxErr = new SyntaxError('Unexpected token } in JSON at position 10');
    (syntaxErr as any).body = '{ bad json }';

    handleApiError(mockRes, syntaxErr);

    expect(capturedStatus).toBe(400);
    expect(capturedJson).toEqual({
      error: '잘못된 JSON 요청 형식입니다.',
    });
  });

  it('should map CORS errors to Korean error message', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedJson = data;
        return this;
      },
    };

    handleApiError(mockRes, new Error('CORS 정책에 의해 허용되지 않은 출처입니다.'));

    expect(capturedStatus).toBe(500);
    expect(capturedJson).toEqual({
      error: 'CORS 정책에 의해 허용되지 않은 출처입니다.',
    });
  });
});
