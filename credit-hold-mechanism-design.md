# Credit Hold Mechanism Design for Scraper Service

## Overview

This document outlines the design for implementing a credit hold mechanism for the Scraper Service, which will prevent double-spending and provide better transaction management for credit usage during lead generation searches.

## Database Schema Changes

### 1. New Table: Credit Holds

We need to add a new table to track credit holds:

```sql
-- Credit holds table for tracking temporary credit reservations
CREATE TABLE IF NOT EXISTS public.credit_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('scraper', 'interaction')),
  amount INTEGER NOT NULL, -- Number of credits held
  reference_id TEXT NOT NULL, -- Reference to the operation (e.g., search_id)
  status TEXT NOT NULL CHECK (status IN ('active', 'converted', 'released', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When the hold expires (default: 1 hour)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Updated Credit Ledger Table

We need to add a `hold_id` field to the credit_ledger table to link transactions to holds:

```sql
-- Add hold_id column to credit_ledger
ALTER TABLE public.credit_ledger 
ADD COLUMN IF NOT EXISTS hold_id UUID REFERENCES public.credit_holds(id);
```

### 3. Indexes for Performance

```sql
-- Create indexes for credit_holds table
CREATE INDEX IF NOT EXISTS idx_credit_holds_user_id ON public.credit_holds(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_holds_status ON public.credit_holds(status);
CREATE INDEX IF NOT EXISTS idx_credit_holds_expires_at ON public.credit_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_holds_reference_id ON public.credit_holds(reference_id);

-- Create index for credit_ledger hold_id
CREATE INDEX IF NOT EXISTS idx_credit_ledger_hold_id ON public.credit_ledger(hold_id);
```

### 4. RLS Policies

```sql
-- Enable RLS on credit_holds table
ALTER TABLE public.credit_holds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_holds table
CREATE POLICY "Users can read own credit holds" ON public.credit_holds
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- Create updated_at trigger for credit_holds
CREATE TRIGGER update_credit_holds_updated_at
  BEFORE UPDATE ON public.credit_holds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Database Functions

### 1. Hold Credits Function

```sql
-- Function to place a hold on credits
CREATE OR REPLACE FUNCTION hold_credits(
  p_user_id TEXT,
  p_credit_type TEXT,
  p_amount INTEGER,
  p_reference_id TEXT,
  p_expires_in_minutes INTEGER DEFAULT 60
)
RETURNS UUID AS $$
DECLARE
  hold_id UUID;
  current_balance INTEGER;
  held_amount INTEGER;
  expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if user has sufficient available credits (balance - holds)
  current_balance := get_credit_balance(p_user_id, p_credit_type);
  
  -- Get total held amount for this user and credit type
  SELECT COALESCE(SUM(amount), 0) INTO held_amount
  FROM public.credit_holds
  WHERE user_id = p_user_id 
    AND credit_type = p_credit_type 
    AND status = 'active'
    AND expires_at > NOW();
  
  -- Check if sufficient credits are available
  IF (current_balance - held_amount) < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Available: %, Required: %', 
      (current_balance - held_amount), p_amount;
  END IF;
  
  -- Set expiration time
  expires_at := NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL;
  
  -- Create the hold
  INSERT INTO public.credit_holds (
    user_id, credit_type, amount, reference_id, status, expires_at
  ) VALUES (
    p_user_id, p_credit_type, p_amount, p_reference_id, 'active', expires_at
  ) RETURNING id INTO hold_id;
  
  RETURN hold_id;
END;
$$ LANGUAGE plpgsql;
```

### 2. Convert Hold to Deduction Function

```sql
-- Function to convert a hold into a permanent deduction
CREATE OR REPLACE FUNCTION convert_hold_to_deduction(
  p_hold_id UUID,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  hold_record RECORD;
  transaction_id UUID;
  current_balance INTEGER;
BEGIN
  -- Get the hold record
  SELECT * INTO hold_record
  FROM public.credit_holds
  WHERE id = p_hold_id AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found or already processed';
  END IF;
  
  -- Get current balance
  current_balance := get_credit_balance(hold_record.user_id, hold_record.credit_type);
  
  -- Create the deduction transaction
  INSERT INTO public.credit_ledger (
    user_id, credit_type, amount, balance_after, source, reference_id, description, hold_id
  ) VALUES (
    hold_record.user_id, 
    hold_record.credit_type, 
    -hold_record.amount, 
    current_balance - hold_record.amount, 
    'usage', 
    hold_record.reference_id, 
    p_description || ' - ' || hold_record.amount || ' ' || hold_record.credit_type || ' credits',
    p_hold_id
  ) RETURNING id INTO transaction_id;
  
  -- Update hold status
  UPDATE public.credit_holds
  SET status = 'converted', updated_at = NOW()
  WHERE id = p_hold_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;
```

### 3. Release Hold Function

```sql
-- Function to release a hold without deducting credits
CREATE OR REPLACE FUNCTION release_credit_hold(
  p_hold_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  hold_record RECORD;
BEGIN
  -- Get the hold record
  SELECT * INTO hold_record
  FROM public.credit_holds
  WHERE id = p_hold_id AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found or already processed';
  END IF;
  
  -- Update hold status
  UPDATE public.credit_holds
  SET status = 'released', updated_at = NOW()
  WHERE id = p_hold_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 4. Get Available Credits Function

```sql
-- Function to get available credits (balance - active holds)
CREATE OR REPLACE FUNCTION get_available_credit_balance(
  p_user_id TEXT,
  p_credit_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  current_balance INTEGER;
  held_amount INTEGER;
BEGIN
  -- Get current balance
  current_balance := get_credit_balance(p_user_id, p_credit_type);
  
  -- Get total held amount
  SELECT COALESCE(SUM(amount), 0) INTO held_amount
  FROM public.credit_holds
  WHERE user_id = p_user_id 
    AND credit_type = p_credit_type 
    AND status = 'active'
    AND expires_at > NOW();
  
  -- Return available balance
  RETURN current_balance - held_amount;
END;
$$ LANGUAGE plpgsql;
```

### 5. Cleanup Expired Holds Function

```sql
-- Function to clean up expired holds (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Update expired holds to 'expired' status
  UPDATE public.credit_holds
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' AND expires_at <= NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;
```

## API Endpoints Design

### 1. Hold Credits Endpoint

**Path:** `POST /api/credits/scraper/hold`

**Request Body:**
```json
{
  "amount": 50,
  "reference_id": "search-uuid",
  "expires_in_minutes": 60
}
```

**Response:**
```json
{
  "hold_id": "uuid",
  "status": "active",
  "expires_at": "2023-12-01T12:00:00Z"
}
```

### 2. Deduct Credits Endpoint

**Path:** `POST /api/credits/scraper/deduct`

**Request Body:**
```json
{
  "hold_id": "uuid",
  "actual_amount": 45,
  "description": "Lead search completed"
}
```

**Response:**
```json
{
  "transaction_id": "uuid",
  "amount_deducted": 45,
  "remaining_balance": 955
}
```

### 3. Release Hold Endpoint

**Path:** `POST /api/credits/scraper/release-hold`

**Request Body:**
```json
{
  "hold_id": "uuid",
  "reason": "Search failed"
}
```

**Response:**
```json
{
  "success": true,
  "hold_id": "uuid"
}
```

### 4. Updated Balance Endpoint

**Path:** `GET /api/credits/balance`

**Enhanced Response:**
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
  }
}
```

## Implementation Flow

### 1. Scraper Search Flow with Credit Holds

1. **Check Available Credits**
   - Call `get_available_credit_balance()` to check if user has sufficient credits
   - Return error if insufficient

2. **Place Credit Hold**
   - Call `hold_credits()` with estimated amount and search reference ID
   - Get hold_id in response

3. **Execute Search**
   - Proceed with the actual scraping operation
   - Track actual credits used

4. **Convert or Release Hold**
   - On success: Call `convert_hold_to_deduction()` with actual amount
   - On failure: Call `release_credit_hold()` with failure reason

### 2. Error Handling and Recovery

1. **Automatic Cleanup**
   - Schedule periodic cleanup of expired holds
   - Use `cleanup_expired_holds()` function

2. **Transaction Safety**
   - All operations should be atomic
   - Implement proper rollback mechanisms

3. **Logging**
   - Log all credit operations with detailed context
   - Include hold_id in all related logs for traceability

## Frontend Considerations

1. **Display Held Credits**
   - Show held credits separately from total balance
   - Display "Available: X (Y held)" format

2. **Real-time Updates**
   - Update credit display after hold operations
   - Refresh balance after search completion

3. **Error Messages**
   - Provide clear error messages for insufficient credits
   - Show held credits in error messages when relevant

## Security Considerations

1. **Authorization**
   - Ensure users can only manage their own credits
   - Validate all inputs and parameters

2. **Race Conditions**
   - Use database transactions to prevent race conditions
   - Implement proper locking mechanisms

3. **Audit Trail**
   - Maintain complete audit trail of all credit operations
   - Include hold lifecycle in audit logs

## Testing Strategy

1. **Unit Tests**
   - Test all database functions with various scenarios
   - Test edge cases (insufficient credits, expired holds, etc.)

2. **Integration Tests**
   - Test complete scraper flow with credit holds
   - Test error scenarios and recovery mechanisms

3. **Load Tests**
   - Test concurrent credit operations
   - Verify performance under high load

## Migration Plan

1. **Phase 1: Database Schema**
   - Add new tables and functions
   - Migrate existing data if needed

2. **Phase 2: API Endpoints**
   - Implement new credit management endpoints
   - Update existing endpoints to use new functions

3. **Phase 3: Scraper Service**
   - Update scraper search API to use credit holds
   - Implement proper error handling

4. **Phase 4: Frontend**
   - Update credit display components
   - Add real-time updates

5. **Phase 5: Testing & Deployment**
   - Comprehensive testing
   - Gradual rollout with monitoring