# Credit Management API Design

## Overview

This document outlines the API endpoints needed to implement the credit hold mechanism for the Scraper Service. These endpoints will handle credit holds, deductions, and releases as part of the lead generation flow.

## API Endpoints

### 1. Hold Credits Endpoint

**Endpoint:** `POST /api/credits/scraper/hold`

**Description:** Places a temporary hold on scraper credits for a specific operation.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "amount": 50,
  "reference_id": "search-uuid",
  "expires_in_minutes": 60
}
```

**Request Parameters:**
- `amount` (integer, required): Number of credits to hold
- `reference_id` (string, required): Reference ID for the operation (e.g., search ID)
- `expires_in_minutes` (integer, optional): Hold expiration time in minutes (default: 60)

**Success Response (200):**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "amount": 50,
  "expires_at": "2023-12-01T12:00:00Z",
  "reference_id": "search-uuid"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
- 401: Unauthorized
- 402: Payment Required (insufficient credits)
- 500: Internal Server Error

**Error Response Example:**
```json
{
  "error": "Insufficient credits. Available: 30, Required: 50",
  "available_credits": 30,
  "required_credits": 50
}
```

### 2. Deduct Credits Endpoint

**Endpoint:** `POST /api/credits/scraper/deduct`

**Description:** Converts a credit hold into a permanent deduction with the actual amount used.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "actual_amount": 45,
  "description": "Lead search completed successfully"
}
```

**Request Parameters:**
- `hold_id` (string, required): The ID of the credit hold to convert
- `actual_amount` (integer, optional): Actual credits used (default: original hold amount)
- `description` (string, optional): Description of the transaction

**Success Response (200):**
```json
{
  "transaction_id": "660e8400-e29b-41d4-a716-446655440000",
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount_deducted": 45,
  "remaining_balance": 955,
  "description": "Lead search completed successfully - 45 scraper credits"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
- 401: Unauthorized
- 404: Hold not found or already processed
- 500: Internal Server Error

### 3. Release Hold Endpoint

**Endpoint:** `POST /api/credits/scraper/release-hold`

**Description:** Releases a credit hold without deducting credits (used when operations fail).

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "Search failed due to external API error"
}
```

**Request Parameters:**
- `hold_id` (string, required): The ID of the credit hold to release
- `reason` (string, optional): Reason for releasing the hold

**Success Response (200):**
```json
{
  "success": true,
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "released",
  "reason": "Search failed due to external API error"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
- 401: Unauthorized
- 404: Hold not found or already processed
- 500: Internal Server Error

### 4. Enhanced Balance Endpoint

**Endpoint:** `GET /api/credits/balance`

**Description:** Gets the user's credit balances including held credits.

**Request Headers:**
```
Authorization: Bearer <clerk_jwt_token>
```

**Success Response (200):**
```json
{
  "scraper_credits": {
    "total": 1000,
    "held": 50,
    "available": 950
  },
  "interaction_credits": {
    "total": 1500,
    "held": 0,
    "available": 1500
  },
  "holds": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "amount": 50,
      "reference_id": "search-uuid",
      "status": "active",
      "expires_at": "2023-12-01T12:00:00Z",
      "created_at": "2023-12-01T11:00:00Z"
    }
  ]
}
```

**Error Responses:**
- 401: Unauthorized
- 500: Internal Server Error

### 5. Get Credit Holds Endpoint

**Endpoint:** `GET /api/credits/scraper/holds`

**Description:** Gets all active credit holds for the user.

**Request Headers:**
```
Authorization: Bearer <clerk_jwt_token>
```

**Query Parameters:**
- `status` (string, optional): Filter by status (active, converted, released, expired)
- `limit` (integer, optional): Maximum number of holds to return (default: 50)
- `offset` (integer, optional): Number of holds to skip (default: 0)

**Success Response (200):**
```json
{
  "holds": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "amount": 50,
      "reference_id": "search-uuid",
      "status": "active",
      "expires_at": "2023-12-01T12:00:00Z",
      "created_at": "2023-12-01T11:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Error Responses:**
- 401: Unauthorized
- 500: Internal Server Error

## Implementation Details

### 1. Authentication & Authorization

All endpoints must:
- Validate the Clerk JWT token
- Extract the user ID from the token
- Ensure users can only access their own credit data

### 2. Error Handling

Standard error response format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "additional": "context"
  }
}
```

Common error codes:
- `INSUFFICIENT_CREDITS`: User doesn't have enough available credits
- `HOLD_NOT_FOUND`: Credit hold not found or already processed
- `INVALID_PARAMETERS`: Request parameters are invalid
- `DATABASE_ERROR`: Database operation failed

### 3. Rate Limiting

Consider implementing rate limiting for:
- Hold creation (prevent abuse)
- Balance checks (prevent excessive queries)

### 4. Logging

All endpoints should log:
- User ID
- Operation performed
- Amount involved
- Success/failure status
- Relevant error details

### 5. Transaction Safety

- All database operations should be atomic
- Implement proper rollback mechanisms
- Handle concurrent operations safely

## Integration with Scraper Service

### 1. Updated Scraper Search Flow

```typescript
// 1. Check available credits
const balanceResponse = await fetch('/api/credits/balance');
const { scraper_credits } = await balanceResponse.json();

if (scraper_credits.available < estimatedCredits) {
  return error('Insufficient credits');
}

// 2. Place credit hold
const holdResponse = await fetch('/api/credits/scraper/hold', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: estimatedCredits,
    reference_id: searchId,
    expires_in_minutes: 60
  })
});
const { hold_id } = await holdResponse.json();

// 3. Execute search
try {
  const results = await executeSearch(searchCriteria);
  
  // 4. Convert hold to deduction with actual amount
  const actualCredits = calculateActualCredits(results);
  await fetch('/api/credits/scraper/deduct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hold_id,
      actual_amount: actualCredits,
      description: `Lead search - ${actualCredits} credits`
    })
  });
  
  return results;
} catch (error) {
  // 5. Release hold on failure
  await fetch('/api/credits/scraper/release-hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hold_id,
      reason: error.message
    })
  });
  
  throw error;
}
```

### 2. Frontend Integration

```typescript
// Update credit display to show held credits
const updateCreditDisplay = async () => {
  const response = await fetch('/api/credits/balance');
  const { scraper_credits } = await response.json();
  
  setCredits({
    total: scraper_credits.total,
    held: scraper_credits.held,
    available: scraper_credits.available
  });
};

// Display format: "Available: 950 (50 held)"
```

## Testing Strategy

### 1. Unit Tests

Test each endpoint with:
- Valid requests
- Invalid parameters
- Authentication failures
- Edge cases (zero amounts, expired holds, etc.)

### 2. Integration Tests

Test complete flows:
- Hold → Deduct flow
- Hold → Release flow
- Concurrent operations
- Error scenarios

### 3. Load Tests

Test performance under:
- High volume of hold operations
- Concurrent user operations
- Database connection limits

## Security Considerations

1. **Input Validation**
   - Validate all input parameters
   - Sanitize user inputs
   - Check for SQL injection vulnerabilities

2. **Authorization**
   - Ensure users can only access their own data
   - Validate JWT tokens properly
   - Implement proper session management

3. **Rate Limiting**
   - Prevent abuse of credit hold system
   - Implement reasonable limits per user

4. **Audit Trail**
   - Log all credit operations
   - Include user context and timestamps
   - Maintain immutable audit records

## Monitoring & Alerting

1. **Key Metrics**
   - Credit hold creation rate
   - Hold conversion/release rates
   - Failed operations
   - Response times

2. **Alerts**
   - High failure rates
   - Unusual credit usage patterns
   - Database connection issues
   - Long-running operations

3. **Dashboards**
   - Real-time credit usage
   - Hold lifecycle metrics
   - User credit balances
   - System performance