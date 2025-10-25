-- SaaS AI Marketing Website Database Schema
-- This migration creates tables for users, subscriptions, credits, billing, and lead management

-- Users table (extends Clerk authentication)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL, -- Clerk user ID
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- Trial, Basic, Pro, Enterprise
  price DECIMAL(10, 2) NOT NULL, -- Monthly price in IDR
  scraper_credits INTEGER NOT NULL, -- Monthly scraper credits allocation
  interaction_credits INTEGER NOT NULL, -- Monthly interaction credits allocation
  features JSONB, -- Additional features as JSON
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'cancelled', 'past_due')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_method_id TEXT, -- Stripe payment method ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit ledger table for tracking all credit transactions
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('scraper', 'interaction')),
  amount INTEGER NOT NULL, -- Positive for credits added, negative for credits used
  balance_after INTEGER NOT NULL, -- Running balance after this transaction
  source TEXT NOT NULL CHECK (source IN ('trial_allocation', 'monthly_allocation', 'topup_purchase', 'usage', 'refund')),
  reference_id TEXT, -- Reference to related transaction (e.g., invoice_id, search_id)
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoices table for billing
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id),
  invoice_number TEXT UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'cancelled')),
  due_date TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  line_items JSONB, -- Details of what was billed
  stripe_invoice_id TEXT, -- Stripe invoice ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit top-up packages
CREATE TABLE IF NOT EXISTS public.credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  scraper_credits INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead search history
CREATE TABLE IF NOT EXISTS public.lead_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  search_criteria JSONB NOT NULL, -- Search parameters
  results_count INTEGER NOT NULL,
  credits_used INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leads data
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.lead_searches(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  position TEXT,
  linkedin_url TEXT,
  source TEXT,
  additional_data JSONB, -- Additional lead information
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- WhatsApp messages
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('outgoing', 'incoming')),
  content TEXT NOT NULL,
  whatsapp_message_id TEXT, -- WhatsApp API message ID
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  credits_used INTEGER DEFAULT 1, -- Usually 1 credit per message
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('welcome', 'billing_success', 'billing_failed', 'credits_low', 'subscription_cancelled')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.jwt() ->> 'sub' = clerk_id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.jwt() ->> 'sub' = clerk_id);

-- RLS Policies for subscriptions table
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- RLS Policies for credit_ledger table
CREATE POLICY "Users can read own credit transactions" ON public.credit_ledger
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- RLS Policies for invoices table
CREATE POLICY "Users can read own invoices" ON public.invoices
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- RLS Policies for lead_searches table
CREATE POLICY "Users can read own lead searches" ON public.lead_searches
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert own lead searches" ON public.lead_searches
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);

-- RLS Policies for leads table
CREATE POLICY "Users can read own leads" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lead_searches 
      WHERE lead_searches.id = leads.search_id 
      AND lead_searches.user_id = auth.jwt() ->> 'sub'
    )
  );

-- RLS Policies for whatsapp_messages table
CREATE POLICY "Users can read own whatsapp messages" ON public.whatsapp_messages
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert own whatsapp messages" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);

-- RLS Policies for notifications table
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON public.users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_credit_type ON public.credit_ledger(credit_type);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_lead_searches_user_id ON public.lead_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_search_id ON public.leads(search_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user_id ON public.whatsapp_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id ON public.whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- Create updated_at triggers
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_searches_updated_at
  BEFORE UPDATE ON public.lead_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, price, scraper_credits, interaction_credits, features) VALUES
('Trial', 0, 100, 150, '{"lead_export": true, "whatsapp_integration": true, "support": "email"}'),
('Basic', 2499000, 10000, 15000, '{"lead_export": true, "whatsapp_integration": true, "support": "email", "api_access": false}'),
('Pro', 4999000, 25000, 50000, '{"lead_export": true, "whatsapp_integration": true, "support": "priority", "api_access": true, "advanced_filters": true}'),
('Enterprise', 9999000, 100000, 200000, '{"lead_export": true, "whatsapp_integration": true, "support": "24/7", "api_access": true, "advanced_filters": true, "custom_integrations": true, "dedicated_account_manager": true}')
ON CONFLICT DO NOTHING;

-- Insert default credit packages
INSERT INTO public.credit_packages (name, description, scraper_credits, price) VALUES
('Starter Pack', '5,000 additional scraper credits', 5000, 999000),
('Growth Pack', '15,000 additional scraper credits', 15000, 2499000),
('Pro Pack', '50,000 additional scraper credits', 50000, 7499000),
('Enterprise Pack', '150,000 additional scraper credits', 150000, 19999000)
ON CONFLICT DO NOTHING;

-- Create function to get current credit balance for a user
CREATE OR REPLACE FUNCTION get_credit_balance(p_user_id TEXT, p_credit_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO current_balance
  FROM public.credit_ledger
  WHERE user_id = p_user_id AND credit_type = p_credit_type;
  
  RETURN current_balance;
END;
$$ LANGUAGE plpgsql;

-- Create function to add credit transaction
CREATE OR REPLACE FUNCTION add_credit_transaction(
  p_user_id TEXT,
  p_credit_type TEXT,
  p_amount INTEGER,
  p_source TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  current_balance INTEGER;
BEGIN
  -- Get current balance
  current_balance := get_credit_balance(p_user_id, p_credit_type);
  
  -- Insert new transaction
  INSERT INTO public.credit_ledger (
    user_id, credit_type, amount, balance_after, source, reference_id, description
  ) VALUES (
    p_user_id, p_credit_type, p_amount, current_balance + p_amount, p_source, p_reference_id, p_description
  ) RETURNING id INTO transaction_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;