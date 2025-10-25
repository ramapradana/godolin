# Interaction Credit Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the Interaction Credit Usage flow for WhatsApp messaging. The strategy covers unit tests, integration tests, end-to-end tests, and performance tests to ensure the reliability and robustness of the credit hold mechanism.

## Testing Objectives

1. **Functional Correctness**: Ensure all credit operations work as expected
2. **Data Integrity**: Verify no credit double-spending or data corruption
3. **Error Handling**: Test all error scenarios and recovery mechanisms
4. **Performance**: Ensure system performs under load
5. **Security**: Validate authentication and authorization controls
6. **User Experience**: Test frontend components and user interactions

## Test Environment Setup

### Test Database

1. **Separate Test Database**: Isolated from production data
2. **Test Data Seeding**: Pre-populated with test users and credits
3. **Cleanup Procedures**: Automated cleanup between test runs
4. **Mock Services**: Mock WhatsApp API for controlled testing

### Test Users

```typescript
// Test user configurations
const testUsers = {
  userWithCredits: {
    clerk_id: 'test_user_1',
    email: 'user1@test.com',
    interaction_credits: 100,
    scraper_credits: 1000
  },
  userWithNoCredits: {
    clerk_id: 'test_user_2',
    email: 'user2@test.com',
    interaction_credits: 0,
    scraper_credits: 0
  },
  userWithHeldCredits: {
    clerk_id: 'test_user_3',
    email: 'user3@test.com',
    interaction_credits: 50,
    held_credits: 25
  }
};
```

## Unit Tests

### 1. Interaction Credit API Endpoints

#### Hold Credits Endpoint Tests

```typescript
// src/tests/api/credits/interaction/hold.test.ts
import { POST } from '@/app/api/credits/interaction/hold/route';
import { createMockRequest } from '@/tests/utils/mock-request';

describe('POST /api/credits/interaction/hold', () => {
  beforeEach(() => {
    // Reset test database
    jest.clearAllMocks();
  });

  test('should successfully create credit hold', async () => {
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
    expect(data.hold_id).toBeDefined();
    expect(data.status).toBe('active');
    expect(data.amount).toBe(1);
    expect(data.reference_id).toBe('test-ref-123');
  });

  test('should reject hold with insufficient credits', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 100,
        reference_id: 'test-ref-123'
      }
    }, 'test_user_2'); // User with no credits

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(402);
    expect(data.error).toBe('Insufficient credits');
    expect(data.code).toBe('INSUFFICIENT_CREDITS');
    expect(data.available_credits).toBe(0);
    expect(data.required_credits).toBe(100);
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
    const request = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    }, null); // No user ID

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
```

#### Deduct Credits Endpoint Tests

```typescript
// src/tests/api/credits/interaction/deduct.test.ts
import { POST } from '@/app/api/credits/interaction/deduct/route';
import { createMockRequest } from '@/tests/utils/mock-request';

describe('POST /api/credits/interaction/deduct', () => {
  test('should successfully convert hold to deduction', async () => {
    // First create a hold
    const holdRequest = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    });

    const holdResponse = await POST(holdRequest);
    const holdData = await holdResponse.json();

    // Then convert to deduction
    const deductRequest = createMockRequest({
      method: 'POST',
      body: {
        hold_id: holdData.hold_id,
        description: 'Test deduction'
      }
    });

    const response = await POST(deductRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transaction_id).toBeDefined();
    expect(data.hold_id).toBe(holdData.hold_id);
    expect(data.amount_deducted).toBe(1);
    expect(data.remaining_balance).toBeGreaterThanOrEqual(0);
  });

  test('should handle partial deduction', async () => {
    // Create a hold for 5 credits
    const holdRequest = createMockRequest({
      method: 'POST',
      body: {
        amount: 5,
        reference_id: 'test-ref-123'
      }
    });

    const holdResponse = await POST(holdRequest);
    const holdData = await holdResponse.json();

    // Deduct only 3 credits
    const deductRequest = createMockRequest({
      method: 'POST',
      body: {
        hold_id: holdData.hold_id,
        actual_amount: 3,
        description: 'Partial deduction test'
      }
    });

    const response = await POST(deductRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.amount_deducted).toBe(3);
    expect(data.amount_refunded).toBe(2);
  });

  test('should reject invalid hold_id', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        hold_id: 'invalid-hold-id',
        description: 'Test deduction'
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe('HOLD_NOT_FOUND');
  });
});
```

#### Release Hold Endpoint Tests

```typescript
// src/tests/api/credits/interaction/release-hold.test.ts
import { POST } from '@/app/api/credits/interaction/release-hold/route';
import { createMockRequest } from '@/tests/utils/mock-request';

describe('POST /api/credits/interaction/release-hold', () => {
  test('should successfully release credit hold', async () => {
    // First create a hold
    const holdRequest = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    });

    const holdResponse = await POST(holdRequest);
    const holdData = await holdResponse.json();

    // Then release the hold
    const releaseRequest = createMockRequest({
      method: 'POST',
      body: {
        hold_id: holdData.hold_id,
        reason: 'Test release'
      }
    });

    const response = await POST(releaseRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hold_id).toBe(holdData.hold_id);
    expect(data.status).toBe('released');
    expect(data.reason).toBe('Test release');
  });

  test('should handle already processed holds', async () => {
    // Create and convert a hold
    const holdRequest = createMockRequest({
      method: 'POST',
      body: {
        amount: 1,
        reference_id: 'test-ref-123'
      }
    });

    const holdResponse = await POST(holdRequest);
    const holdData = await holdResponse.json();

    // Convert to deduction first
    const deductRequest = createMockRequest({
      method: 'POST',
      body: {
        hold_id: holdData.hold_id
      }
    });

    await POST(deductRequest);

    // Try to release the already processed hold
    const releaseRequest = createMockRequest({
      method: 'POST',
      body: {
        hold_id: holdData.hold_id
      }
    });

    const response = await POST(releaseRequest);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe('HOLD_NOT_FOUND');
  });
});
```

### 2. WhatsApp Send Route Tests

```typescript
// src/tests/api/whatsapp/send.test.ts
import { POST } from '@/app/api/whatsapp/send/route';
import { createMockRequest } from '@/tests/utils/mock-request';

describe('POST /api/whatsapp/send', () => {
  test('should successfully send message with credit hold', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        message: 'Test message',
        phone_number: '+1234567890'
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message_id).toBeDefined();
    expect(data.status).toBe('sent');
    expect(data.credits_used).toBe(1);
    expect(data.hold_id).toBeDefined();
    expect(data.remaining_credits).toBeGreaterThanOrEqual(0);
  });

  test('should handle insufficient credits', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        message: 'Test message',
        phone_number: '+1234567890'
      }
    }, 'test_user_2'); // User with no credits

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(402);
    expect(data.error).toBe('Insufficient interaction credits');
    expect(data.code).toBe('INSUFFICIENT_CREDITS');
  });

  test('should handle WhatsApp API failure', async () => {
    // Mock WhatsApp API to fail
    jest.mock('@/lib/whatsapp-service', () => ({
      sendWhatsAppMessage: jest.fn().mockRejectedValue(new Error('WhatsApp API error'))
    }));

    const request = createMockRequest({
      method: 'POST',
      body: {
        message: 'Test message',
        phone_number: '+1234567890'
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to send WhatsApp message');
    expect(data.credits_released).toBe(1);
  });

  test('should validate required fields', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        // Missing message
        phone_number: '+1234567890'
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Message content is required');
  });
});
```

### 3. Frontend Component Tests

```typescript
// src/tests/components/interaction-credit-display.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InteractionCreditDisplay } from '@/components/credits/interaction-credit-display';

// Mock fetch
global.fetch = jest.fn();

describe('InteractionCreditDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should display credit information correctly', async () => {
    const mockCredits = {
      interaction_credits: {
        total: 100,
        held: 10,
        available: 90
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCredits
    });

    render(<InteractionCreditDisplay />);

    await waitFor(() => {
      expect(screen.getByText('90')).toBeInTheDocument();
      expect(screen.getByText('100 total')).toBeInTheDocument();
      expect(screen.getByText('10 held')).toBeInTheDocument();
    });
  });

  test('should handle fetch errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<InteractionCreditDisplay />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading credits/)).toBeInTheDocument();
    });
  });

  test('should refresh credits on button click', async () => {
    const mockCredits = {
      interaction_credits: {
        total: 100,
        held: 10,
        available: 90
      }
    };

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockCredits
    });

    render(<InteractionCreditDisplay showRefreshButton={true} />);

    const refreshButton = screen.getByRole('button');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });

  test('should display compact view correctly', async () => {
    const mockCredits = {
      interaction_credits: {
        total: 100,
        held: 10,
        available: 90
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCredits
    });

    render(<InteractionCreditDisplay compact={true} />);

    await waitFor(() => {
      expect(screen.getByText('Interaction Credits:')).toBeInTheDocument();
      expect(screen.getByText('90')).toBeInTheDocument();
      expect(screen.getByText('10 held')).toBeInTheDocument();
    });
  });
});
```

## Integration Tests

### 1. Credit Hold Lifecycle Tests

```typescript
// src/tests/integration/credit-hold-lifecycle.test.ts
describe('Credit Hold Lifecycle', () => {
  test('should complete full hold -> deduct lifecycle', async () => {
    // 1. Create hold
    const holdResponse = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1,
        reference_id: 'lifecycle-test-123'
      })
    });

    const holdData = await holdResponse.json();
    expect(holdResponse.status).toBe(200);
    expect(holdData.status).toBe('active');

    // 2. Check balance shows held credits
    const balanceResponse = await fetch('/api/credits/interaction/balance');
    const balanceData = await balanceResponse.json();
    expect(balanceData.interaction_credits.held).toBeGreaterThan(0);

    // 3. Convert to deduction
    const deductResponse = await fetch('/api/credits/interaction/deduct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hold_id: holdData.hold_id,
        description: 'Lifecycle test deduction'
      })
    });

    const deductData = await deductResponse.json();
    expect(deductResponse.status).toBe(200);
    expect(deductData.amount_deducted).toBe(1);

    // 4. Verify balance updated
    const finalBalanceResponse = await fetch('/api/credits/interaction/balance');
    const finalBalanceData = await finalBalanceResponse.json();
    expect(finalBalanceData.interaction_credits.total).toBeLessThan(balanceData.interaction_credits.total);
  });

  test('should complete full hold -> release lifecycle', async () => {
    // 1. Create hold
    const holdResponse = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1,
        reference_id: 'lifecycle-release-test-123'
      })
    });

    const holdData = await holdResponse.json();
    expect(holdResponse.status).toBe(200);

    // 2. Release hold
    const releaseResponse = await fetch('/api/credits/interaction/release-hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hold_id: holdData.hold_id,
        reason: 'Lifecycle test release'
      })
    });

    const releaseData = await releaseResponse.json();
    expect(releaseResponse.status).toBe(200);
    expect(releaseData.status).toBe('released');

    // 3. Verify credits not deducted
    const balanceResponse = await fetch('/api/credits/interaction/balance');
    const balanceData = await balanceResponse.json();
    expect(balanceData.interaction_credits.held).toBe(0);
  });
});
```

### 2. WhatsApp Message Flow Tests

```typescript
// src/tests/integration/whatsapp-message-flow.test.ts
describe('WhatsApp Message Flow', () => {
  test('should complete full message sending flow', async () => {
    // 1. Check initial credits
    const initialBalanceResponse = await fetch('/api/credits/interaction/balance');
    const initialBalance = await initialBalanceResponse.json();
    const initialCredits = initialBalance.interaction_credits.available;

    // 2. Send message
    const messageResponse = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Integration test message',
        phone_number: '+1234567890'
      })
    });

    const messageData = await messageResponse.json();
    expect(messageResponse.status).toBe(200);
    expect(messageData.status).toBe('sent');
    expect(messageData.credits_used).toBe(1);

    // 3. Verify credit deduction
    const finalBalanceResponse = await fetch('/api/credits/interaction/balance');
    const finalBalance = await finalBalanceResponse.json();
    expect(finalBalance.interaction_credits.available).toBe(initialCredits - 1);

    // 4. Verify message record created
    const messageHistoryResponse = await fetch('/api/whatsapp/messages');
    const messageHistory = await messageHistoryResponse.json();
    expect(messageHistory.messages).toContainEqual(
      expect.objectContaining({
        id: messageData.message_id,
        status: 'sent',
        credits_used: 1
      })
    );
  });

  test('should handle message sending failure', async () => {
    // Mock WhatsApp API failure
    // This would require test environment setup to mock external APIs

    // 1. Check initial credits
    const initialBalanceResponse = await fetch('/api/credits/interaction/balance');
    const initialBalance = await initialBalanceResponse.json();
    const initialCredits = initialBalance.interaction_credits.available;

    // 2. Send message (will fail)
    const messageResponse = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test message that will fail',
        phone_number: '+1234567890'
      })
    });

    const messageData = await messageResponse.json();
    expect(messageResponse.status).toBe(500);
    expect(messageData.credits_released).toBe(1);

    // 3. Verify credits not deducted
    const finalBalanceResponse = await fetch('/api/credits/interaction/balance');
    const finalBalance = await finalBalanceResponse.json();
    expect(finalBalance.interaction_credits.available).toBe(initialCredits);
  });
});
```

## End-to-End Tests

### 1. User Journey Tests

```typescript
// src/tests/e2e/user-journey.test.ts
import { test, expect } from '@playwright/test';

test.describe('WhatsApp Message Sending Journey', () => {
  test('user should send message and see credit deduction', async ({ page }) => {
    // 1. Login as test user
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'user1@test.com');
    await page.fill('[data-testid=password]', 'testpassword');
    await page.click('[data-testid=login-button]');

    // 2. Navigate to WhatsApp page
    await page.click('[data-testid=whatsapp-link]');
    await page.waitForURL('/whatsapp');

    // 3. Check initial credit display
    const creditDisplay = page.locator('[data-testid=interaction-credit-display]');
    await expect(creditDisplay).toBeVisible();
    
    const initialCredits = await creditDisplay.locator('[data-testid=available-credits]').textContent();
    expect(initialCredits).toMatch(/\d+/);

    // 4. Send message
    await page.fill('[data-testid=message-input]', 'E2E test message');
    await page.click('[data-testid=send-button]');

    // 5. Verify message status
    const messageStatus = page.locator('[data-testid=message-status]');
    await expect(messageStatus).toContainText('sent');

    // 6. Verify credit deduction
    const updatedCredits = await creditDisplay.locator('[data-testid=available-credits]').textContent();
    expect(parseInt(updatedCredits!)).toBe(parseInt(initialCredits!) - 1);

    // 7. Check message history
    await page.click('[data-testid=message-history-tab]');
    const messageHistory = page.locator('[data-testid=message-history]');
    await expect(messageHistory).toContainText('E2E test message');
  });

  test('user should see insufficient credits warning', async ({ page }) => {
    // 1. Login as user with no credits
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'user2@test.com');
    await page.fill('[data-testid=password]', 'testpassword');
    await page.click('[data-testid=login-button]');

    // 2. Navigate to WhatsApp page
    await page.click('[data-testid=whatsapp-link]');

    // 3. Verify credit warning
    const creditWarning = page.locator('[data-testid=credit-warning]');
    await expect(creditWarning).toBeVisible();
    await expect(creditWarning).toContainText('0 interaction credits remaining');

    // 4. Verify send button is disabled
    const sendButton = page.locator('[data-testid=send-button]');
    await expect(sendButton).toBeDisabled();
  });
});
```

## Performance Tests

### 1. Load Testing

```typescript
// src/tests/performance/load-test.ts
import { loadTest } from '@/tests/utils/load-test';

describe('Credit System Load Tests', () => {
  test('should handle concurrent credit holds', async () => {
    const concurrentUsers = 100;
    const requestsPerUser = 10;

    const results = await loadTest({
      url: '/api/credits/interaction/hold',
      method: 'POST',
      concurrentUsers,
      requestsPerUser,
      body: {
        amount: 1,
        reference_id: 'load-test-123'
      }
    });

    expect(results.successRate).toBeGreaterThan(99);
    expect(results.averageResponseTime).toBeLessThan(500);
    expect(results.errorRate).toBeLessThan(1);
  });

  test('should handle concurrent WhatsApp sends', async () => {
    const concurrentUsers = 50;
    const requestsPerUser = 5;

    const results = await loadTest({
      url: '/api/whatsapp/send',
      method: 'POST',
      concurrentUsers,
      requestsPerUser,
      body: {
        message: 'Load test message',
        phone_number: '+1234567890'
      }
    });

    expect(results.successRate).toBeGreaterThan(95);
    expect(results.averageResponseTime).toBeLessThan(2000);
    expect(results.errorRate).toBeLessThan(5);
  });
});
```

### 2. Stress Testing

```typescript
// src/tests/performance/stress-test.ts
describe('Credit System Stress Tests', () => {
  test('should handle high volume credit operations', async () => {
    const highVolumeOperations = 10000;
    const batchSize = 100;

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < highVolumeOperations; i += batchSize) {
      const batch = Array.from({ length: batchSize }, (_, index) => 
        fetch('/api/credits/interaction/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 1,
            reference_id: `stress-test-${i + index}`
          })
        })
      );

      const results = await Promise.allSettled(batch);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
        }
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const operationsPerSecond = (successCount / duration) * 1000;

    expect(operationsPerSecond).toBeGreaterThan(100);
    expect(errorCount).toBeLessThan(successCount * 0.01); // Less than 1% error rate
  });
});
```

## Security Tests

### 1. Authentication Tests

```typescript
// src/tests/security/authentication.test.ts
describe('Authentication Security', () => {
  test('should reject requests without authentication', async () => {
    const response = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1,
        reference_id: 'security-test-123'
      })
    });

    expect(response.status).toBe(401);
  });

  test('should reject requests with invalid JWT', async () => {
    const response = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-jwt-token'
      },
      body: JSON.stringify({
        amount: 1,
        reference_id: 'security-test-123'
      })
    });

    expect(response.status).toBe(401);
  });

  test('should prevent cross-user data access', async () => {
    // User 1 creates a hold
    const user1HoldResponse = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer user1-jwt-token'
      },
      body: JSON.stringify({
        amount: 1,
        reference_id: 'security-test-123'
      })
    });

    const user1HoldData = await user1HoldResponse.json();

    // User 2 tries to access User 1's hold
    const user2DeductResponse = await fetch('/api/credits/interaction/deduct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer user2-jwt-token'
      },
      body: JSON.stringify({
        hold_id: user1HoldData.hold_id
      })
    });

    expect(user2DeductResponse.status).toBe(404);
  });
});
```

### 2. Input Validation Tests

```typescript
// src/tests/security/input-validation.test.ts
describe('Input Validation Security', () => {
  test('should sanitize SQL injection attempts', async () => {
    const maliciousInput = "'; DROP TABLE credit_holds; --";

    const response = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1,
        reference_id: maliciousInput
      })
    });

    // Should either reject the input or handle it safely
    expect(response.status).toBeOneOf([400, 422]);
    
    // Verify database integrity
    const dbCheckResponse = await fetch('/api/credits/interaction/holds');
    expect(dbCheckResponse.status).toBe(200);
  });

  test('should handle large payloads gracefully', async () => {
    const largePayload = {
      amount: 1,
      reference_id: 'a'.repeat(10000), // Very long string
      description: 'b'.repeat(50000) // Very long description
    };

    const response = await fetch('/api/credits/interaction/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(largePayload)
    });

    expect(response.status).toBeOneOf([400, 413, 422]);
  });
});
```

## Test Automation

### 1. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
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
```

### 2. Test Data Management

```typescript
// src/tests/utils/test-data-manager.ts
export class TestDataManager {
  static async setupTestDatabase() {
    // Clean up existing test data
    await this.cleanupTestData();
    
    // Seed test users and credits
    await this.seedTestUsers();
    await this.seedTestCredits();
  }

  static async cleanupTestData() {
    const tables = [
      'credit_holds',
      'credit_ledger',
      'whatsapp_messages',
      'users'
    ];

    for (const table of tables) {
      await db.query(`DELETE FROM ${table} WHERE clerk_id LIKE 'test_%'`);
    }
  }

  static async seedTestUsers() {
    const testUsers = [
      { clerk_id: 'test_user_1', email: 'user1@test.com' },
      { clerk_id: 'test_user_2', email: 'user2@test.com' },
      { clerk_id: 'test_user_3', email: 'user3@test.com' }
    ];

    for (const user of testUsers) {
      await db.query(`
        INSERT INTO users (clerk_id, email) 
        VALUES ($1, $2)
        ON CONFLICT (clerk_id) DO NOTHING
      `, [user.clerk_id, user.email]);
    }
  }

  static async seedTestCredits() {
    const creditAllocations = [
      { user_id: 'test_user_1', interaction_credits: 100, scraper_credits: 1000 },
      { user_id: 'test_user_2', interaction_credits: 0, scraper_credits: 0 },
      { user_id: 'test_user_3', interaction_credits: 50, scraper_credits: 500 }
    ];

    for (const allocation of creditAllocations) {
      // Add interaction credits
      await db.query(`
        INSERT INTO credit_ledger (user_id, credit_type, amount, balance_after, source, description)
        VALUES ($1, 'interaction', $2, $2, 'test_allocation', 'Test interaction credits')
      `, [allocation.user_id, allocation.interaction_credits]);

      // Add scraper credits
      await db.query(`
        INSERT INTO credit_ledger (user_id, credit_type, amount, balance_after, source, description)
        VALUES ($1, 'scraper', $2, $2, 'test_allocation', 'Test scraper credits')
      `, [allocation.user_id, allocation.scraper_credits]);
    }
  }
}
```

## Test Reporting

### 1. Coverage Reports

```typescript
// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/app/api/credits/interaction/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

### 2. Test Results Dashboard

```typescript
// src/tests/utils/test-reporter.ts
export class TestReporter {
  static generateReport(testResults: TestResults) {
    const report = {
      summary: {
        total: testResults.numTotalTests,
        passed: testResults.numPassedTests,
        failed: testResults.numFailedTests,
        skipped: testResults.numPendingTests,
        coverage: testResults.coverageMap
      },
      failedTests: testResults.testResults.filter(test => 
        test.numFailingTests > 0
      ),
      performanceMetrics: testResults.performanceMetrics,
      securityIssues: testResults.securityIssues
    };

    return report;
  }

  static async publishReport(report: TestReport) {
    // Publish to test results dashboard
    await fetch('/api/test-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
  }
}
```

## Conclusion

This comprehensive testing strategy ensures the reliability, security, and performance of the Interaction Credit Usage flow for WhatsApp messaging. The strategy covers:

1. **Unit Tests**: Individual component and function testing
2. **Integration Tests**: API endpoint and database interaction testing
3. **End-to-End Tests**: Complete user journey testing
4. **Performance Tests**: Load and stress testing
5. **Security Tests**: Authentication and input validation testing

By implementing this testing strategy, we can ensure the credit hold mechanism works correctly, prevents double-spending, handles errors gracefully, and provides a reliable user experience.