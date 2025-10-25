import { POST } from '@/app/api/credits/interaction/hold/route';
import { createMockRequest } from '@/tests/utils/mock-request';

// Mock the auth module
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn().mockResolvedValue({
    userId: 'test-user-123'
  })
}));

// Mock the supabase client
jest.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: jest.fn().mockReturnValue({
    rpc: jest.fn()
  })
}));

describe('POST /api/credits/interaction/hold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully create interaction credit hold', async () => {
    const mockSupabase = require('@/lib/supabase').createSupabaseServerClient();
    
    // Mock successful hold creation
    mockSupabase.rpc.mockResolvedValueOnce({
      data: 'hold-id-123',
      error: null
    });

    // Mock hold record fetch
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValueOnce({
        eq: jest.fn().mockReturnValueOnce({
          single: jest.fn().mockResolvedValueOnce({
            data: {
              id: 'hold-id-123',
              status: 'active',
              amount: 1,
              expires_at: '2023-12-01T12:30:00Z',
              reference_id: 'test-ref-123',
              created_at: '2023-12-01T12:00:00Z'
            },
            error: null
          })
        })
      })
    });

    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123',
        expires_in_minutes: 30
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hold_id).toBe('hold-id-123');
    expect(data.status).toBe('active');
    expect(data.amount).toBe(1);
    expect(data.reference_id).toBe('test-ref-123');
  });

  test('should reject hold with insufficient credits', async () => {
    const mockSupabase = require('@/lib/supabase').createSupabaseServerClient();
    
    // Mock insufficient credits error
    mockSupabase.rpc.mockRejectedValueOnce(new Error('Insufficient credits. Available: 0, Required: 1'));

    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(402);
    expect(data.error).toBe('Insufficient interaction credits');
    expect(data.code).toBe('INSUFFICIENT_CREDITS');
    expect(data.available_credits).toBe(0);
    expect(data.required_credits).toBe(1);
  });

  test('should validate required fields', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 0, // Invalid amount
        reference_id: '' // Empty reference
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('INVALID_AMOUNT');
  });

  test('should handle unauthorized requests', async () => {
    // Mock auth to return no user
    const { auth } = require('@clerk/nextjs/server');
    auth.mockResolvedValueOnce({ userId: null });

    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});