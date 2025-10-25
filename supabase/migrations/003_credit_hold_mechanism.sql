-- Credit Hold Mechanism for Scraper Service
-- This migration adds tables and functions to support credit holds

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

-- Add hold_id column to credit_ledger to link transactions to holds
ALTER TABLE public.credit_ledger 
ADD COLUMN IF NOT EXISTS hold_id UUID REFERENCES public.credit_holds(id);

-- Create indexes for credit_holds table
CREATE INDEX IF NOT EXISTS idx_credit_holds_user_id ON public.credit_holds(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_holds_status ON public.credit_holds(status);
CREATE INDEX IF NOT EXISTS idx_credit_holds_expires_at ON public.credit_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_holds_reference_id ON public.credit_holds(reference_id);

-- Create index for credit_ledger hold_id
CREATE INDEX IF NOT EXISTS idx_credit_ledger_hold_id ON public.credit_ledger(hold_id);

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
    COALESCE(p_description, 'Usage') || ' - ' || hold_record.amount || ' ' || hold_record.credit_type || ' credits',
    p_hold_id
  ) RETURNING id INTO transaction_id;
  
  -- Update hold status
  UPDATE public.credit_holds
  SET status = 'converted', updated_at = NOW()
  WHERE id = p_hold_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

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