import { NextRequest } from 'next/server';

export function createMockRequest(options: {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
} = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/test');
  
  // Add query parameters if needed
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const request = {
    url: url.toString(),
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...options.headers
    },
    json: async () => options.body || {},
    text: async () => JSON.stringify(options.body || {}),
    cookies: {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    },
    nextUrl: jest.fn(),
    page: jest.fn(),
    ua: jest.fn(),
    cache: jest.fn(),
    credentials: 'omit',
    destination: undefined,
    integrity: undefined,
    keepalive: undefined
  } as any;

  return request;
}