# Billing Cycle Testing Strategy

This document outlines the comprehensive testing strategy for the Monthly Billing Cycle automated system process.

## Testing Overview

The testing strategy covers multiple levels of testing to ensure the billing cycle works correctly under various scenarios:

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test component interactions
3. **End-to-End Tests** - Test complete billing flows
4. **Performance Tests** - Test system under load
5. **Security Tests** - Test security measures

## 1. Unit Testing

### 1.1 Credit Management Tests

#### Test File: `src/tests/api/credits/interaction/reset.test.ts`

```typescript
import { POST } from '@/app/api/credits/interaction/reset/route';
import { createMockRequest } from '@/tests/utils/mock-request';
import { createSupabaseServerClient } from '@/lib/supabase';

// Mock Supabase
jest.mock('@/lib/supabase');
const mockSupabase = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

describe('POST /api/credits/interaction/reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reset interaction credits successfully', async () => {
    // Arrange
    const userId = 'user-123';
    const amount = 15000;
    const referenceId = 'invoice-123';
    const description = 'Monthly interaction credits reset';
    
    const mockSupabaseClient = {
      rpc: jest.fn().mockResolvedValueOnce({
        data: 'transaction-id-123',
        error: null
      }).mockResolvedValueOnce({
        data: 15000,
        error: null
      })
    };
    
    mockSupabase.mockReturnValue(mockSupabaseClient);
    
    const request = createMockRequest({
      method: 'POST',
      body: { amount, reference_id: referenceId, description },
      userId
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transaction_id).toBe('transaction-id-123');
    expect(data.amount_reset).toBe(amount);
    expect(data.new_balance).toBe(15000);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reset_interaction_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reference_id: referenceId,
      p_description: description
    });
  });

  it('should return error for invalid amount', async () => {
    // Arrange
    const userId = 'user-123';
    const amount = -100;
    
    const request = createMockRequest({
      method: 'POST',
      body: { amount },
      userId
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Valid amount is required');
    expect(data.code).toBe('INVALID_AMOUNT');
  });

  it('should handle database errors', async () => {
    // Arrange
    const userId = 'user-123';
    const amount = 15000;
    
    const mockSupabaseClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })
    };
    
    mockSupabase.mockReturnValue(mockSupabaseClient);
    
    const request = createMockRequest({
      method: 'POST',
      body: { amount },
      userId
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to reset interaction credits');
  });
});
```

#### Test File: `src/tests/api/credits/scraper/add.test.ts`

```typescript
import { POST } from '@/app/api/credits/scraper/add/route';
import { createMockRequest } from '@/tests/utils/mock-request';
import { createSupabaseServerClient } from '@/lib/supabase';

// Mock Supabase
jest.mock('@/lib/supabase');
const mockSupabase = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

describe('POST /api/credits/scraper/add', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add scraper credits successfully', async () => {
    // Arrange
    const userId = 'user-123';
    const amount = 10000;
    const referenceId = 'invoice-123';
    const description = 'Monthly scraper credits addition';
    
    const mockSupabaseClient = {
      rpc: jest.fn().mockResolvedValueOnce({
        data: 'transaction-id-123',
        error: null
      }).mockResolvedValueOnce({
        data: 25000, // Existing balance 15000 + new 10000
        error: null
      })
    };
    
    mockSupabase.mockReturnValue(mockSupabaseClient);
    
    const request = createMockRequest({
      method: 'POST',
      body: { amount, reference_id: referenceId, description },
      userId
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transaction_id).toBe('transaction-id-123');
    expect(data.amount_added).toBe(amount);
    expect(data.new_balance).toBe(25000);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('add_scraper_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reference_id: referenceId,
      p_description: description
    });
  });

  it('should return error for zero amount', async () => {
    // Arrange
    const userId = 'user-123';
    const amount = 0;
    
    const request = createMockRequest({
      method: 'POST',
      body: { amount },
      userId
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Valid amount is required');
    expect(data.code).toBe('INVALID_AMOUNT');
  });
});
```

### 1.2 Payment Gateway Tests

#### Test File: `src/tests/lib/ipaymu-service.test.ts`

```typescript
import { IPaymuService } from '@/lib/ipaymu-service';

// Mock fetch
global.fetch = jest.fn();

describe('IPaymuService', () => {
  let ipaymuService: IPaymuService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IPAYMU_API_KEY = 'test-api-key';
    process.env.IPAYMU_SANDBOX = 'true';
    process.env.NEXT_PUBLIC_APP_URL = 'https://test-app.com';
    
    ipaymuService = new IPaymuService();
  });

  it('should create payment successfully', async () => {
    // Arrange
    const paymentParams = {
      amount: 2499000,
      description: 'Basic Plan Subscription',
      referenceId: 'INV-123',
      customerEmail: 'test@example.com',
      customerName: 'Test User'
    };

    const mockResponse = {
      Status: 200,
      Data: {
        TransactionId: 'txn-123',
        PaymentUrl: 'https://sandbox.ipaymu.com/payment/txn-123'
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse)
    });

    // Act
    const result = await ipaymuService.createPayment(paymentParams);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.ipaymu.com/api/v2/payment',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
        }
      })
    );
  });

  it('should handle payment creation failure', async () => {
    // Arrange
    const paymentParams = {
      amount: 2499000,
      description: 'Basic Plan Subscription',
      referenceId: 'INV-123',
      customerEmail: 'test@example.com',
      customerName: 'Test User'
    };

    const mockResponse = {
      Status: 400,
      Message: 'Invalid payment parameters'
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValue(mockResponse)
    });

    // Act & Assert
    await expect(ipaymuService.createPayment(paymentParams))
      .rejects.toThrow('Invalid payment parameters');
  });

  it('should check payment status successfully', async () => {
    // Arrange
    const transactionId = 'txn-123';
    
    const mockResponse = {
      Status: 200,
      Data: {
        TransactionId: transactionId,
        Status: 'success',
        Amount: 2499000
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse)
    });

    // Act
    const result = await ipaymuService.checkPaymentStatus(transactionId);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.ipaymu.com/api/v2/payment/txn-123',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-api-key',
        }
      })
    );
  });
});
```

### 1.3 Billing Service Tests

#### Test File: `src/tests/api/billing/renew.test.ts`

```typescript
import { POST } from '@/app/api/billing/renew/route';
import { createMockRequest } from '@/tests/utils/mock-request';
import { createSupabaseServerClient } from '@/lib/supabase';

// Mock dependencies
jest.mock('@/lib/supabase');
jest.mock('@/lib/ipaymu-service');

const mockSupabase = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

describe('POST /api/billing/renew', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BILLING_CRON_SECRET = 'test-secret';
  });

  it('should process due subscriptions successfully', async () => {
    // Arrange
    const dueSubscriptions = [
      {
        subscription_id: 'sub-123',
        user_id: 'user-123',
        plan_id: 'plan-123',
        plan_name: 'Basic',
        price: 2499000,
        scraper_credits: 10000,
        interaction_credits: 15000,
        current_period_end: new Date().toISOString()
      }
    ];

    const mockSupabaseClient = {
      rpc: jest.fn().mockResolvedValueOnce({
        data: dueSubscriptions,
        error: null
      }).mockResolvedValueOnce({
        data: 'invoice-123',
        error: null
      }).mockResolvedValueOnce({
        data: null,
        error: null
      }).mockResolvedValueOnce({
        data: null,
        error: null
      }).mockResolvedValueOnce({
        data: null,
        error: null
      }),
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'invoice-123' },
        error: null
      }),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis()
    };
    
    mockSupabase.mockReturnValue(mockSupabaseClient);
    
    const request = createMockRequest({
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-secret'
      }
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].status).toBe('success');
  });

  it('should handle unauthorized requests', async () => {
    // Arrange
    const request = createMockRequest({
      method: 'POST',
      headers: {
        'authorization': 'Bearer wrong-secret'
      }
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should handle database errors', async () => {
    // Arrange
    const mockSupabaseClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })
    };
    
    mockSupabase.mockReturnValue(mockSupabaseClient);
    
    const request = createMockRequest({
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-secret'
      }
    });

    // Act
    const response = await POST(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch subscriptions');
  });
});
```

## 2. Integration Testing

### 2.1 Successful Renewal Flow Test

#### Test File: `src/tests/integration/billing/successful-renewal.test.ts`

```typescript
import { createSupabaseServerClient } from '@/lib/supabase';
import { IPaymuService } from '@/lib/ipaymu-service';

describe('Successful Renewal Flow Integration', () => {
  let supabase: any;
  let ipaymuService: IPaymuService;

  beforeAll(async () => {
    // Setup test database
    supabase = createSupabaseServerClient();
    ipaymuService = new IPaymuService();
    
    // Create test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
  });

  it('should complete full renewal flow successfully', async () => {
    // Arrange
    const testSubscription = await createTestSubscription();
    const initialInteractionBalance = await getCreditBalance(testSubscription.user_id, 'interaction');
    const initialScraperBalance = await getCreditBalance(testSubscription.user_id, 'scraper');

    // Act - Trigger renewal
    const renewalResponse = await fetch(`${process.env.TEST_API_URL}/api/billing/renew`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const renewalResult = await renewalResponse.json();

    // Assert - Check renewal response
    expect(renewalResponse.status).toBe(200);
    expect(renewalResult.processed).toBeGreaterThan(0);
    expect(renewalResult.results[0].status).toBe('success');

    // Assert - Check subscription updated
    const updatedSubscription = await getSubscription(testSubscription.id);
    expect(updatedSubscription.status).toBe('active');
    expect(new Date(updatedSubscription.current_period_end)).toBeGreaterThan(
      new Date(testSubscription.current_period_end)
    );

    // Assert - Check invoice created
    const invoice = await getInvoiceBySubscription(testSubscription.id);
    expect(invoice).toBeTruthy();
    expect(invoice.status).toBe('paid');
    expect(invoice.amount).toBe(testSubscription.price);

    // Assert - Check interaction credits reset
    const finalInteractionBalance = await getCreditBalance(testSubscription.user_id, 'interaction');
    expect(finalInteractionBalance).toBe(testSubscription.interaction_credits);

    // Assert - Check scraper credits added
    const finalScraperBalance = await getCreditBalance(testSubscription.user_id, 'scraper');
    expect(finalScraperBalance).toBe(initialScraperBalance + testSubscription.scraper_credits);

    // Assert - Check notification created
    const notification = await getLatestNotification(testSubscription.user_id);
    expect(notification.type).toBe('billing_success');
    expect(notification.title).toContain('Renewed Successfully');
  });

  async function setupTestData() {
    // Create test user, subscription, etc.
  }

  async function cleanupTestData() {
    // Clean up test data
  }

  async function createTestSubscription() {
    // Create and return test subscription
  }

  async function getCreditBalance(userId: string, creditType: string) {
    const { data } = await supabase.rpc('get_credit_balance', {
      p_user_id: userId,
      p_credit_type: creditType
    });
    return data || 0;
  }

  async function getSubscription(subscriptionId: string) {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();
    return data;
  }

  async function getInvoiceBySubscription(subscriptionId: string) {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data;
  }

  async function getLatestNotification(userId: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data;
  }
});
```

### 2.2 Failed Payment Flow Test

#### Test File: `src/tests/integration/billing/failed-payment.test.ts`

```typescript
describe('Failed Payment Flow Integration', () => {
  let supabase: any;

  beforeAll(async () => {
    supabase = createSupabaseServerClient();
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('should handle payment failure and schedule retries', async () => {
    // Arrange
    const testSubscription = await createTestSubscription();
    
    // Mock payment failure
    jest.spyOn(IPaymuService.prototype, 'createPayment')
      .mockRejectedValue(new Error('Payment failed'));

    // Act - Trigger renewal
    const renewalResponse = await fetch(`${process.env.TEST_API_URL}/api/billing/renew`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const renewalResult = await renewalResponse.json();

    // Assert - Check renewal response
    expect(renewalResponse.status).toBe(200);
    expect(renewalResult.results[0].status).toBe('failed');

    // Assert - Check subscription status
    const updatedSubscription = await getSubscription(testSubscription.id);
    expect(updatedSubscription.status).toBe('past_due');

    // Assert - Check invoice status
    const invoice = await getInvoiceBySubscription(testSubscription.id);
    expect(invoice.status).toBe('failed');

    // Assert - Check retry scheduled
    const retry = await getFirstRetry(testSubscription.id);
    expect(retry).toBeTruthy();
    expect(retry.attempt_number).toBe(1);
    expect(retry.status).toBe('pending');

    // Assert - Check notification created
    const notification = await getLatestNotification(testSubscription.user_id);
    expect(notification.type).toBe('billing_failed');
    expect(notification.title).toContain('Payment Failed');

    // Restore mock
    jest.restoreAllMocks();
  });

  it('should cancel subscription after 5 failed retries', async () => {
    // Arrange
    const testSubscription = await createTestSubscription();
    
    // Create 5 failed retries
    for (let i = 1; i <= 5; i++) {
      await createFailedRetry(testSubscription.id, i);
    }

    // Mock payment failure for retry processing
    jest.spyOn(IPaymuService.prototype, 'createPayment')
      .mockRejectedValue(new Error('Payment failed'));

    // Act - Process retries
    const retryResponse = await fetch(`${process.env.TEST_API_URL}/api/billing/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const retryResult = await retryResponse.json();

    // Assert - Check retry response
    expect(retryResponse.status).toBe(200);
    expect(retryResult.results[0].status).toBe('failed');

    // Assert - Check subscription cancelled
    const updatedSubscription = await getSubscription(testSubscription.id);
    expect(updatedSubscription.status).toBe('cancelled');

    // Assert - Check cancellation notification
    const notification = await getLatestNotification(testSubscription.user_id);
    expect(notification.type).toBe('subscription_cancelled');
    expect(notification.title).toContain('Subscription Cancelled');

    // Restore mock
    jest.restoreAllMocks();
  });

  async function createFailedRetry(subscriptionId: string, attemptNumber: number) {
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() - 1); // Set to yesterday for immediate processing

    return await supabase
      .from('payment_retries')
      .insert({
        subscription_id: subscriptionId,
        attempt_number: attemptNumber,
        retry_date: retryDate.toISOString(),
        status: 'pending'
      });
  }

  async function getFirstRetry(subscriptionId: string) {
    const { data } = await supabase
      .from('payment_retries')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .order('attempt_number', { ascending: true })
      .limit(1)
      .single();
    return data;
  }
});
```

## 3. End-to-End Testing

### 3.1 E2E Test with Playwright

#### Test File: `src/tests/e2e/billing-cycle.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Billing Cycle E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'test@example.com');
    await page.fill('[data-testid=password]', 'test-password');
    await page.click('[data-testid=login-button]');
    await page.waitForURL('/dashboard');
  });

  test('should show successful renewal in billing history', async ({ page }) => {
    // Navigate to billing page
    await page.click('[data-testid=billing-link]');
    await page.waitForURL('/billing');

    // Trigger renewal (via admin endpoint or test script)
    await triggerTestRenewal();

    // Refresh billing page
    await page.reload();

    // Check for successful renewal
    await expect(page.locator('[data-testid=billing-success-message]')).toBeVisible();
    await expect(page.locator('[data-testid=invoice-status]')).toContainText('Paid');
  });

  test('should handle payment failure gracefully', async ({ page }) => {
    // Navigate to billing page
    await page.click('[data-testid=billing-link]');
    await page.waitForURL('/billing');

    // Trigger failed renewal (via admin endpoint or test script)
    await triggerFailedRenewal();

    // Refresh billing page
    await page.reload();

    // Check for payment failure notification
    await expect(page.locator('[data-testid=billing-failure-message]')).toBeVisible();
    await expect(page.locator('[data-testid=invoice-status]')).toContainText('Failed');
  });

  test('should show updated credit balances after renewal', async ({ page }) => {
    // Get initial credit balances
    await page.goto('/dashboard');
    const initialInteractionCredits = await page.textContent('[data-testid=interaction-credits]');
    const initialScraperCredits = await page.textContent('[data-testid=scraper-credits]');

    // Trigger renewal
    await triggerTestRenewal();

    // Refresh dashboard
    await page.reload();

    // Check updated credits
    const finalInteractionCredits = await page.textContent('[data-testid=interaction-credits]');
    const finalScraperCredits = await page.textContent('[data-testid=scraper-credits]');

    // Interaction credits should be reset to plan amount
    expect(finalInteractionCredits).toBe('15,000'); // Basic plan amount
    
    // Scraper credits should be increased
    expect(parseInt(finalScraperCredits?.replace(/,/g, '') || '0'))
      .toBeGreaterThan(parseInt(initialInteractionCredits?.replace(/,/g, '') || '0'));
  });

  async function triggerTestRenewal() {
    // Call test endpoint to trigger renewal
    await fetch(`${process.env.TEST_API_URL}/api/test/trigger-renewal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TEST_API_KEY}`,
      },
    });
  }

  async function triggerFailedRenewal() {
    // Call test endpoint to trigger failed renewal
    await fetch(`${process.env.TEST_API_URL}/api/test/trigger-failed-renewal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TEST_API_KEY}`,
      },
    });
  }
});
```

## 4. Performance Testing

### 4.1 Load Testing with Artillery

#### Test File: `src/tests/performance/billing-load-test.yml`

```yaml
config:
  target: '{{ $processEnvironment.TEST_API_URL }}'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
    - duration: 60
      arrivalRate: 100
      name: "Stress test"
  payload:
    path: "test-data.csv"
    fields:
      - "subscription_id"
      - "user_id"

scenarios:
  - name: "Billing Renewal Load Test"
    weight: 70
    flow:
      - post:
          url: "/api/billing/renew"
          headers:
            Authorization: "Bearer {{ $processEnvironment.BILLING_CRON_SECRET }}"
          capture:
            - json: "$.processed"
              as: "processed_count"

  - name: "Payment Retry Load Test"
    weight: 30
    flow:
      - post:
          url: "/api/billing/retry"
          headers:
            Authorization: "Bearer {{ $processEnvironment.BILLING_CRON_SECRET }}"
          capture:
            - json: "$.processed"
              as: "retry_count"
```

### 4.2 Performance Metrics

Monitor these metrics during performance tests:

1. **Response Time**
   - Average response time < 2 seconds
   - 95th percentile < 5 seconds
   - Maximum response time < 10 seconds

2. **Throughput**
   - Handle 100+ concurrent renewal requests
   - Process 1000+ subscriptions per minute

3. **Error Rate**
   - Error rate < 1%
   - No database connection failures
   - No payment gateway timeouts

4. **Resource Usage**
   - CPU usage < 80%
   - Memory usage < 1GB
   - Database connections < 100

## 5. Security Testing

### 5.1 Authentication Tests

```typescript
// src/tests/security/billing-auth.test.ts
describe('Billing API Security', () => {
  it('should reject requests without authentication', async () => {
    const response = await fetch(`${process.env.TEST_API_URL}/api/billing/renew`, {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  it('should reject requests with invalid authentication', async () => {
    const response = await fetch(`${process.env.TEST_API_URL}/api/billing/renew`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-secret',
      },
    });

    expect(response.status).toBe(401);
  });

  it('should allow requests with valid authentication', async () => {
    const response = await fetch(`${process.env.TEST_API_URL}/api/billing/renew`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
      },
    });

    expect(response.status).toBe(200);
  });
});
```

### 5.2 Input Validation Tests

```typescript
// src/tests/security/input-validation.test.ts
describe('Input Validation Security', () => {
  it('should sanitize SQL injection attempts', async () => {
    const maliciousInput = "'; DROP TABLE subscriptions; --";
    
    const response = await fetch(`${process.env.TEST_API_URL}/api/credits/interaction/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
      },
      body: JSON.stringify({
        amount: maliciousInput,
        reference_id: maliciousInput,
        description: maliciousInput
      }),
    });

    expect(response.status).toBe(400);
    
    // Verify database still intact
    const { data } = await supabase
      .from('subscriptions')
      .select('count')
      .limit(1);
    
    expect(data).toBeTruthy();
  });

  it('should handle large payloads gracefully', async () => {
    const largePayload = {
      amount: 15000,
      reference_id: 'x'.repeat(10000),
      description: 'x'.repeat(10000)
    };
    
    const response = await fetch(`${process.env.TEST_API_URL}/api/credits/interaction/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`,
      },
      body: JSON.stringify(largePayload),
    });

    expect(response.status).toBe(413); // Payload Too Large
  });
});
```

## 6. Test Data Management

### 6.1 Test Database Setup

```typescript
// src/tests/utils/test-db-setup.ts
export class TestDatabaseSetup {
  static async setupTestEnvironment() {
    // Create test schema
    await this.createTestSchema();
    
    // Seed test data
    await this.seedTestData();
    
    // Set up test user
    await this.createTestUser();
  }

  static async cleanupTestEnvironment() {
    // Clean up test data
    await this.cleanupTestData();
    
    // Drop test schema
    await this.dropTestSchema();
  }

  private static async createTestSchema() {
    // Create test-specific database schema
  }

  private static async seedTestData() {
    // Seed test subscription plans
    await this.seedSubscriptionPlans();
    
    // Seed test users
    await this.seedUsers();
  }

  private static async createTestUser() {
    // Create test user with known credentials
  }

  private static async cleanupTestData() {
    // Clean up all test data
  }
}
```

### 6.2 Mock Data Factory

```typescript
// src/tests/utils/mock-data-factory.ts
export class MockDataFactory {
  static createSubscription(overrides = {}) {
    return {
      id: 'sub-' + Math.random().toString(36).substr(2, 9),
      user_id: 'user-' + Math.random().toString(36).substr(2, 9),
      plan_id: 'plan-basic',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
      ...overrides
    };
  }

  static createInvoice(overrides = {}) {
    return {
      id: 'inv-' + Math.random().toString(36).substr(2, 9),
      user_id: 'user-' + Math.random().toString(36).substr(2, 9),
      subscription_id: 'sub-' + Math.random().toString(36).substr(2, 9),
      invoice_number: 'INV-' + Date.now(),
      amount: 2499000,
      status: 'pending',
      ...overrides
    };
  }

  static createPaymentRetry(overrides = {}) {
    return {
      id: 'retry-' + Math.random().toString(36).substr(2, 9),
      subscription_id: 'sub-' + Math.random().toString(36).substr(2, 9),
      attempt_number: 1,
      retry_date: new Date().toISOString(),
      status: 'pending',
      ...overrides
    };
  }
}
```

## 7. Test Execution

### 7.1 Test Scripts

```json
// package.json scripts
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:performance": "artillery run src/tests/performance/billing-load-test.yml",
    "test:security": "jest --testPathPattern=security",
    "test:all": "npm run test && npm run test:integration && npm run test:e2e && npm run test:security"
  }
}
```

### 7.2 CI/CD Integration

```yaml
# .github/workflows/billing-tests.yml
name: Billing Cycle Tests

on:
  push:
    branches: [ main, develop ]
    paths: [ 'src/app/api/billing/**', 'src/lib/billing/**' ]
  pull_request:
    branches: [ main ]
    paths: [ 'src/app/api/billing/**', 'src/lib/billing/**' ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e

  performance-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:performance
```

This comprehensive testing strategy ensures the Monthly Billing Cycle system is thoroughly tested across all levels, from individual components to complete end-to-end flows, with proper performance and security validation.