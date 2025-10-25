# Interaction Credit API Specification

## Overview

This document provides detailed specifications for the Interaction Credit API endpoints that will be implemented to support the WhatsApp credit hold mechanism. These endpoints mirror the scraper credit endpoints but are specifically designed for interaction credits.

## Base URL

All endpoints are relative to the base API URL:
```
https://your-domain.com/api/credits/interaction
```

## Authentication

All endpoints require authentication via Clerk JWT token:
```
Authorization: Bearer <clerk_jwt_token>
```

## Endpoints

### 1. Hold Interaction Credits

**Endpoint:** `POST /api/credits/interaction/hold`

**Description:** Places a temporary hold on interaction credits for a WhatsApp message operation.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "amount": 1,
  "reference_id": "whatsapp-msg-uuid",
  "expires_in_minutes": 30
}
```

**Request Parameters:**
- `amount` (integer, required): Number of credits to hold (typically 1 for WhatsApp messages)
- `reference_id` (string, required): Reference ID for the operation (e.g., WhatsApp message ID)
- `expires_in_minutes` (integer, optional): Hold expiration time in minutes (default: 30, max: 1440)

**Success Response (200):**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "amount": 1,
  "expires_at": "2023-12-01T12:30:00Z",
  "reference_id": "whatsapp-msg-uuid",
  "created_at": "2023-12-01T12:00:00Z"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
```json
{
  "error": "Invalid amount. Amount must be a positive integer.",
  "code": "INVALID_AMOUNT"
}
```

- 401: Unauthorized
```json
{
  "error": "Unauthorized"
}
```

- 402: Payment Required (insufficient credits)
```json
{
  "error": "Insufficient credits",
  "code": "INSUFFICIENT_CREDITS",
  "available_credits": 0,
  "required_credits": 1
}
```

- 500: Internal Server Error
```json
{
  "error": "Failed to hold credits",
  "code": "HOLD_FAILED",
  "details": "Database error occurred"
}
```

### 2. Deduct Interaction Credits

**Endpoint:** `POST /api/credits/interaction/deduct`

**Description:** Converts a credit hold into a permanent deduction after successful WhatsApp message delivery.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "actual_amount": 1,
  "description": "WhatsApp message sent successfully"
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
  "amount_deducted": 1,
  "remaining_balance": 149,
  "description": "WhatsApp message sent successfully - 1 interaction credit"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
```json
{
  "error": "Hold ID is required.",
  "code": "MISSING_HOLD_ID"
}
```

- 404: Hold not found or already processed
```json
{
  "error": "Hold not found or already processed",
  "code": "HOLD_NOT_FOUND"
}
```

- 500: Internal Server Error
```json
{
  "error": "Failed to deduct credits",
  "code": "DEDUCTION_FAILED",
  "details": "Database error occurred"
}
```

### 3. Release Interaction Credit Hold

**Endpoint:** `POST /api/credits/interaction/release-hold`

**Description:** Releases a credit hold without deducting credits (used when WhatsApp message fails).

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <clerk_jwt_token>
```

**Request Body:**
```json
{
  "hold_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "WhatsApp API temporarily unavailable"
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
  "reason": "WhatsApp API temporarily unavailable"
}
```

**Error Responses:**
- 400: Bad Request (invalid parameters)
```json
{
  "error": "Hold ID is required.",
  "code": "MISSING_HOLD_ID"
}
```

- 404: Hold not found or already processed
```json
{
  "error": "Hold not found or already processed",
  "code": "HOLD_NOT_FOUND"
}
```

- 500: Internal Server Error
```json
{
  "error": "Failed to release hold",
  "code": "RELEASE_FAILED",
  "details": "Database error occurred"
}
```

### 4. Get Interaction Credit Balance

**Endpoint:** `GET /api/credits/interaction/balance`

**Description:** Gets the user's interaction credit balance including held credits.

**Request Headers:**
```
Authorization: Bearer <clerk_jwt_token>
```

**Success Response (200):**
```json
{
  "interaction_credits": {
    "total": 150,
    "held": 5,
    "available": 145
  },
  "holds": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "amount": 1,
      "reference_id": "whatsapp-msg-uuid",
      "status": "active",
      "expires_at": "2023-12-01T12:30:00Z",
      "created_at": "2023-12-01T12:00:00Z"
    }
  ]
}
```

**Error Responses:**
- 401: Unauthorized
```json
{
  "error": "Unauthorized"
}
```

- 500: Internal Server Error
```json
{
  "error": "Failed to fetch credit balance",
  "code": "BALANCE_FETCH_FAILED"
}
```

### 5. List Interaction Credit Holds

**Endpoint:** `GET /api/credits/interaction/holds`

**Description:** Gets all interaction credit holds for the user.

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
      "amount": 1,
      "reference_id": "whatsapp-msg-uuid",
      "status": "active",
      "expires_at": "2023-12-01T12:30:00Z",
      "created_at": "2023-12-01T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Error Responses:**
- 401: Unauthorized
```json
{
  "error": "Unauthorized"
}
```

- 500: Internal Server Error
```json
{
  "error": "Failed to fetch credit holds",
  "code": "HOLDS_FETCH_FAILED"
}
```

## Database Functions

The endpoints will leverage existing database functions from the credit hold mechanism:

### hold_credits()
```sql
hold_credits(
  p_user_id TEXT,
  p_credit_type TEXT, -- 'interaction'
  p_amount INTEGER,
  p_reference_id TEXT,
  p_expires_in_minutes INTEGER DEFAULT 30
)
```

### convert_hold_to_deduction()
```sql
convert_hold_to_deduction(
  p_hold_id UUID,
  p_description TEXT DEFAULT NULL
)
```

### release_credit_hold()
```sql
release_credit_hold(
  p_hold_id UUID,
  p_reason TEXT DEFAULT NULL
)
```

### get_credit_balance()
```sql
get_credit_balance(
  p_user_id TEXT,
  p_credit_type TEXT -- 'interaction'
)
```

### get_available_credit_balance()
```sql
get_available_credit_balance(
  p_user_id TEXT,
  p_credit_type TEXT -- 'interaction'
)
```

## Implementation Notes

### Error Handling
- All endpoints should implement consistent error handling
- Use structured error responses with error codes
- Log all errors with appropriate context
- Implement proper HTTP status codes

### Security
- Validate all input parameters
- Ensure users can only access their own data
- Implement rate limiting for hold operations
- Sanitize all database queries

### Performance
- Use database transactions for atomic operations
- Implement appropriate caching for balance queries
- Optimize database queries with proper indexes
- Monitor response times

### Logging
- Log all credit operations with user context
- Include operation type, amount, and result
- Log errors with full stack traces
- Implement audit trails for compliance

## Integration with WhatsApp Service

The interaction credit endpoints will be integrated into the WhatsApp send flow:

1. **Before Sending Message**: Call `POST /api/credits/interaction/hold`
2. **After Successful Send**: Call `POST /api/credits/interaction/deduct`
3. **After Failed Send**: Call `POST /api/credits/interaction/release-hold`
4. **For Credit Display**: Call `GET /api/credits/interaction/balance`

## Testing Requirements

### Unit Tests
- Test all endpoints with valid and invalid inputs
- Verify error handling for all scenarios
- Test database function calls
- Validate authentication and authorization

### Integration Tests
- Test complete WhatsApp message flow
- Verify credit hold lifecycle
- Test concurrent operations
- Validate error recovery mechanisms

### Load Tests
- Test performance under high load
- Verify concurrent credit operations
- Test database connection limits
- Validate system scalability

## Monitoring

### Key Metrics
- Hold creation rate
- Hold conversion/release rates
- API response times
- Error rates by type

### Alerting
- High failure rates
- Unusual credit usage patterns
- Database performance issues
- Long-running operations

## Versioning

The API will follow semantic versioning:
- Major version changes for breaking changes
- Minor version changes for new features
- Patch version changes for bug fixes

Current version: v1.0.0