# Billing Cycle Database Migrations

This document contains the SQL migration files needed for implementing the Monthly Billing Cycle automated system process.

## Migration 004: Billing Cycle Enhancements

File: `supabase/migrations/004_billing_cycle_enhancements.sql`

```sql
-- Billing Cycle Enhancements
-- This migration adds tables and functions for the monthly billing cycle process

-- Payment retries table for tracking retry attempts
CREATE TABLE IF NOT EXISTS public.payment_retries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  attempt_number INTEGER NOT NULL,
  retry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
  payment_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing logs table for auditing all billing operations
CREATE TABLE IF NOT EXISTS public.billing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('renewal', 'retry', 'cancellation', 'credit_reset', 'credit_add')),
  subscription_id UUID REFERENCES public.subscriptions(id),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'error')),
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for payment_retries table
CREATE INDEX IF NOT EXISTS idx_payment_retries_subscription_id ON public.payment_retries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_retries_status ON public.payment_retries(status);
CREATE INDEX IF NOT EXISTS idx_payment_retries_retry_date ON public.payment_retries(retry_date);

-- Create indexes for billing_logs table
CREATE INDEX IF NOT EXISTS idx_billing_logs_subscription_id ON public.billing_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_logs_user_id ON public.billing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_logs_event_type ON public.billing_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_logs_created_at ON public.billing_logs(created_at DESC);

-- Enable RLS on new tables
ALTER TABLE public.payment_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_retries table
CREATE POLICY "Service can read all payment retries" ON public.payment_retries
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service can insert payment retries" ON public.payment_retries
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service can update payment retries" ON public.payment_retries
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for billing_logs table
CREATE POLICY "Service can read all billing logs" ON public.billing_logs
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service can insert billing logs" ON public.billing_logs
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Create updated_at triggers
CREATE TRIGGER update_payment_retries_updated_at
  BEFORE UPDATE ON public.payment_retries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to reset interaction credits (discard old balance and add new allocation)
CREATE OR REPLACE FUNCTION reset_interaction_credits(
  p_user_id TEXT,
  p_amount INTEGER,
  p_reference_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  current_balance INTEGER;
BEGIN
  -- Get current balance
  current_balance := get_credit_balance(p_user_id, 'interaction');
  
  -- Create negative transaction to reset to zero
  INSERT INTO public.credit_ledger (
    user_id, credit_type, amount, balance_after, source, reference_id, description
  ) VALUES (
    p_user_id, 'interaction', -current_balance, 0, 'monthly_reset', p_reference_id, 
    COALESCE(p_description, 'Monthly interaction credits reset')
  ) RETURNING id INTO transaction_id;
  
  -- Add new allocation
  INSERT INTO public.credit_ledger (
    user_id, credit_type, amount, balance_after, source, reference_id, description
  ) VALUES (
    p_user_id, 'interaction', p_amount, p_amount, 'monthly_allocation', p_reference_id,
    COALESCE(p_description, 'Monthly interaction credits allocation')
  );
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add scraper credits (accumulative)
CREATE OR REPLACE FUNCTION add_scraper_credits(
  p_user_id TEXT,
  p_amount INTEGER,
  p_reference_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  current_balance INTEGER;
BEGIN
  -- Get current balance
  current_balance := get_credit_balance(p_user_id, 'scraper');
  
  -- Add new allocation to existing balance
  INSERT INTO public.credit_ledger (
    user_id, credit_type, amount, balance_after, source, reference_id, description
  ) VALUES (
    p_user_id, 'scraper', p_amount, current_balance + p_amount, 'monthly_allocation', p_reference_id,
    COALESCE(p_description, 'Monthly scraper credits allocation')
  ) RETURNING id INTO transaction_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to schedule payment retry
CREATE OR REPLACE FUNCTION schedule_payment_retry(
  p_subscription_id UUID,
  p_attempt_number INTEGER,
  p_retry_date TIMESTAMP WITH TIME ZONE
)
RETURNS UUID AS $$
DECLARE
  retry_id UUID;
BEGIN
  -- Create retry record
  INSERT INTO public.payment_retries (
    subscription_id, attempt_number, retry_date, status
  ) VALUES (
    p_subscription_id, p_attempt_number, p_retry_date, 'pending'
  ) RETURNING id INTO retry_id;
  
  RETURN retry_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel subscription after failed retries
CREATE OR REPLACE FUNCTION cancel_subscription(
  p_subscription_id UUID,
  p_reason TEXT DEFAULT 'Payment failed after multiple retries'
)
RETURNS BOOLEAN AS $$
DECLARE
  subscription_record RECORD;
BEGIN
  -- Get subscription record
  SELECT * INTO subscription_record
  FROM public.subscriptions
  WHERE id = p_subscription_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;
  
  -- Update subscription status
  UPDATE public.subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_subscription_id;
  
  -- Log cancellation
  INSERT INTO public.billing_logs (
    event_type, subscription_id, user_id, status, details
  ) VALUES (
    'cancellation', p_subscription_id, subscription_record.user_id, 'success', 
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get retry schedule (1, 2, 4, 7, 14 days)
CREATE OR REPLACE FUNCTION get_retry_schedule(
  p_base_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TIMESTAMP WITH TIME ZONE[] AS $$
DECLARE
  retry_schedule TIMESTAMP WITH TIME ZONE[];
BEGIN
  retry_schedule := ARRAY[
    p_base_date + INTERVAL '1 day',
    p_base_date + INTERVAL '2 days',
    p_base_date + INTERVAL '4 days',
    p_base_date + INTERVAL '7 days',
    p_base_date + INTERVAL '14 days'
  ];
  
  RETURN retry_schedule;
END;
$$ LANGUAGE plpgsql;

-- Function to log billing events
CREATE OR REPLACE FUNCTION log_billing_event(
  p_event_type TEXT,
  p_subscription_id UUID DEFAULT NULL,
  p_user_id TEXT,
  p_status TEXT,
  p_details JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.billing_logs (
    event_type, subscription_id, user_id, status, details, error_message
  ) VALUES (
    p_event_type, p_subscription_id, p_user_id, p_status, p_details, p_error_message
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get subscriptions due for renewal
CREATE OR REPLACE FUNCTION get_subscriptions_due_for_renewal(
  p_check_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  subscription_id UUID,
  user_id TEXT,
  plan_id UUID,
  plan_name TEXT,
  price DECIMAL,
  scraper_credits INTEGER,
  interaction_credits INTEGER,
  current_period_end TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.user_id,
    s.plan_id,
    sp.name,
    sp.price,
    sp.scraper_credits,
    sp.interaction_credits,
    s.current_period_end
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  WHERE s.status = 'active'
    AND DATE(s.current_period_end) <= p_check_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get subscriptions with pending retries
CREATE OR REPLACE FUNCTION get_subscriptions_with_pending_retries(
  p_check_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  retry_id UUID,
  subscription_id UUID,
  user_id TEXT,
  attempt_number INTEGER,
  retry_date TIMESTAMP WITH TIME ZONE,
  plan_name TEXT,
  price DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pr.id,
    pr.subscription_id,
    s.user_id,
    pr.attempt_number,
    pr.retry_date,
    sp.name,
    sp.price
  FROM public.payment_retries pr
  JOIN public.subscriptions s ON pr.subscription_id = s.id
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  WHERE pr.status = 'pending'
    AND DATE(pr.retry_date) <= p_check_date
  ORDER BY pr.retry_date;
END;
$$ LANGUAGE plpgsql;
```

## Environment Variables

Add these environment variables to your `.env.local` file:

```env
# iPaymu Payment Gateway
IPAYMU_API_KEY=SANDBOXA347EEFB-07CD-4845-9610-7FB88CCC9D84
IPAYMU_SANDBOX=true

# Billing Cron Security
BILLING_CRON_SECRET=your-secure-billing-cron-secret-key

# Application URLs
NEXT_PUBLIC_APP_URL=https://your-domain.com
BILLING_WEBHOOK_URL=https://your-domain.com/api/billing/webhook

# Email Configuration (for invoice PDFs)
EMAIL_SERVICE_PROVIDER=your-email-provider
EMAIL_FROM_ADDRESS=billing@your-domain.com
EMAIL_FROM_NAME=Your Company Billing

# PDF Generation
PDF_STORAGE_PATH=./invoices
```

## Additional Notes

1. **Security**: The billing cron endpoint should be secured with the `BILLING_CRON_SECRET` environment variable.

2. **Payment Gateway**: The iPaymu integration will use the sandbox API key for testing. Switch to production key when going live.

3. **Retry Logic**: The retry schedule is hardcoded to 1, 2, 4, 7, and 14 days after the initial failure.

4. **Credit Management**: 
   - Interaction credits are reset (old balance discarded, new allocation added)
   - Scraper credits are accumulative (new allocation added to existing balance)

5. **Logging**: All billing operations are logged to the `billing_logs` table for auditing and debugging.

6. **Webhooks**: The iPaymu webhook endpoint should be implemented to handle payment status updates.