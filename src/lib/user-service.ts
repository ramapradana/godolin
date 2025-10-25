import { createSupabaseServerClient } from './supabase';
import { auth } from '@clerk/nextjs/server';

export interface UserProfile {
  id: string;
  clerk_id: string;
  email: string;
  name?: string;
  phone?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'cancelled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  payment_method_id?: string;
  plan?: {
    name: string;
    price: number;
    scraper_credits: number;
    interaction_credits: number;
    features: any;
  };
}

export interface CreditBalance {
  scraper_credits: number;
  interaction_credits: number;
}

// Get current user from Clerk
export async function getCurrentUser() {
  const { userId } = await auth();
  return userId;
}

// Create or update user profile
export async function upsertUserProfile(userData: Partial<UserProfile>): Promise<UserProfile | null> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('users')
    .upsert({
      clerk_id: userId,
      email: userData.email,
      name: userData.name,
      phone: userData.phone,
      company_name: userData.company_name,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting user profile:', error);
    throw error;
  }

  return data;
}

// Get user profile
export async function getUserProfile(): Promise<UserProfile | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    console.error('Error fetching user profile:', error);
    throw error;
  }

  return data;
}

// Get user subscription with plan details
export async function getUserSubscription(): Promise<Subscription | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      subscription_plans (
        name,
        price,
        scraper_credits,
        interaction_credits,
        features
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user subscription:', error);
    throw error;
  }

  if (data) {
    return {
      ...data,
      plan: data.subscription_plans,
    };
  }

  return null;
}

// Get user credit balances
export async function getUserCreditBalances(): Promise<CreditBalance> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();
  
  // Get scraper credits balance
  const { data: scraperData, error: scraperError } = await supabase
    .rpc('get_credit_balance', { 
      p_user_id: userId, 
      p_credit_type: 'scraper' 
    });

  // Get interaction credits balance
  const { data: interactionData, error: interactionError } = await supabase
    .rpc('get_credit_balance', { 
      p_user_id: userId, 
      p_credit_type: 'interaction' 
    });

  if (scraperError || interactionError) {
    console.error('Error fetching credit balances:', scraperError || interactionError);
    throw scraperError || interactionError;
  }

  return {
    scraper_credits: scraperData || 0,
    interaction_credits: interactionData || 0,
  };
}

// Create initial subscription for new user (trial)
export async function createTrialSubscription(): Promise<Subscription | null> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();
  
  // Get trial plan
  const { data: trialPlan, error: planError } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('name', 'Trial')
    .single();

  if (planError || !trialPlan) {
    console.error('Error fetching trial plan:', planError);
    throw planError || new Error('Trial plan not found');
  }

  // Create subscription
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: trialPlan.id,
      status: 'trial',
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
    })
    .select()
    .single();

  if (subError) {
    console.error('Error creating trial subscription:', subError);
    throw subError;
  }

  // Allocate initial credits
  await allocateCredits(userId, 'trial_allocation', trialPlan.scraper_credits, trialPlan.interaction_credits);

  return {
    ...subscription,
    plan: trialPlan,
  };
}

// Allocate credits to user
export async function allocateCredits(
  userId: string, 
  source: 'trial_allocation' | 'monthly_allocation' | 'topup_purchase',
  scraperCredits: number,
  interactionCredits: number
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  // Add scraper credits
  if (scraperCredits > 0) {
    await supabase.rpc('add_credit_transaction', {
      p_user_id: userId,
      p_credit_type: 'scraper',
      p_amount: scraperCredits,
      p_source: source,
      p_description: `${source} - ${scraperCredits} scraper credits`
    });
  }

  // Add interaction credits
  if (interactionCredits > 0) {
    await supabase.rpc('add_credit_transaction', {
      p_user_id: userId,
      p_credit_type: 'interaction',
      p_amount: interactionCredits,
      p_source: source,
      p_description: `${source} - ${interactionCredits} interaction credits`
    });
  }
}

// Get credit transaction history
export async function getCreditTransactionHistory(creditType: 'scraper' | 'interaction', limit: number = 50) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .eq('user_id', userId)
    .eq('credit_type', creditType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching credit transaction history:', error);
    throw error;
  }

  return data;
}

// Check if user has sufficient credits
export async function checkSufficientCredits(creditType: 'scraper' | 'interaction', requiredAmount: number): Promise<boolean> {
  const balances = await getUserCreditBalances();
  const availableCredits = creditType === 'scraper' ? balances.scraper_credits : balances.interaction_credits;
  return availableCredits >= requiredAmount;
}

// Deduct credits (with hold mechanism for scraper credits)
export async function deductCredits(
  creditType: 'scraper' | 'interaction',
  amount: number,
  referenceId?: string,
  description?: string
): Promise<void> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  // Check sufficient credits first
  const hasCredits = await checkSufficientCredits(creditType, amount);
  if (!hasCredits) {
    throw new Error(`Insufficient ${creditType} credits`);
  }

  // Deduct credits
  const { error } = await supabase.rpc('add_credit_transaction', {
    p_user_id: userId,
    p_credit_type: creditType,
    p_amount: -amount,
    p_source: 'usage',
    p_reference_id: referenceId,
    p_description: description || `Usage - ${amount} ${creditType} credits`
  });

  if (error) {
    console.error('Error deducting credits:', error);
    throw error;
  }
}

// Get available subscription plans
export async function getSubscriptionPlans() {
  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching subscription plans:', error);
    throw error;
  }

  return data;
}

// Credit Hold Management Functions

// Hold credits for a specific operation
export async function holdCredits(
  creditType: 'scraper' | 'interaction',
  amount: number,
  referenceId: string,
  expiresInMinutes: number = 60
): Promise<{ hold_id: string; status: string; expires_at: string }> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  const { data: holdId, error } = await supabase.rpc('hold_credits', {
    p_user_id: userId,
    p_credit_type: creditType,
    p_amount: amount,
    p_reference_id: referenceId,
    p_expires_in_minutes: expiresInMinutes
  });

  if (error) {
    console.error('Error holding credits:', error);
    throw new Error(error.message);
  }

  // Get hold details
  const { data: holdRecord } = await supabase
    .from('credit_holds')
    .select('status, expires_at')
    .eq('id', holdId)
    .single();

  return {
    hold_id: holdId,
    status: holdRecord?.status || 'active',
    expires_at: holdRecord?.expires_at || ''
  };
}

// Convert a credit hold to a permanent deduction
export async function convertHoldToDeduction(
  holdId: string,
  description?: string
): Promise<{ transaction_id: string; amount_deducted: number }> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  // Verify hold belongs to user
  const { data: holdRecord, error: fetchError } = await supabase
    .from('credit_holds')
    .select('*')
    .eq('id', holdId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (fetchError || !holdRecord) {
    throw new Error('Hold not found or not accessible');
  }

  const { data: transactionId, error } = await supabase.rpc('convert_hold_to_deduction', {
    p_hold_id: holdId,
    p_description: description
  });

  if (error) {
    console.error('Error converting hold to deduction:', error);
    throw new Error(error.message);
  }

  return {
    transaction_id: transactionId,
    amount_deducted: holdRecord.amount
  };
}

// Release a credit hold without deducting credits
export async function releaseCreditHold(
  holdId: string,
  reason?: string
): Promise<{ success: boolean; amount_released: number }> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  // Verify hold belongs to user
  const { data: holdRecord, error: fetchError } = await supabase
    .from('credit_holds')
    .select('*')
    .eq('id', holdId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (fetchError || !holdRecord) {
    throw new Error('Hold not found or not accessible');
  }

  const { data: success, error } = await supabase.rpc('release_credit_hold', {
    p_hold_id: holdId,
    p_reason: reason
  });

  if (error) {
    console.error('Error releasing credit hold:', error);
    throw new Error(error.message);
  }

  return {
    success: !!success,
    amount_released: holdRecord.amount
  };
}

// Get available credit balance (total - held)
export async function getAvailableCreditBalance(creditType: 'scraper' | 'interaction'): Promise<number> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('get_available_credit_balance', {
    p_user_id: userId,
    p_credit_type: creditType
  });

  if (error) {
    console.error('Error getting available credit balance:', error);
    throw new Error(error.message);
  }

  return data || 0;
}

// Get user's credit holds
export async function getCreditHolds(
  creditType: 'scraper' | 'interaction',
  status?: 'active' | 'converted' | 'released' | 'expired',
  limit: number = 50
): Promise<any[]> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('credit_holds')
    .select('*')
    .eq('user_id', userId)
    .eq('credit_type', creditType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching credit holds:', error);
    throw new Error(error.message);
  }

  return data || [];
}

// Enhanced credit balance function that includes held credits
export async function getEnhancedCreditBalances(): Promise<{
  scraper_credits: { total: number; held: number; available: number };
  interaction_credits: { total: number; held: number; available: number };
}> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createSupabaseServerClient();

  // Get total balances
  const { data: scraperTotal, error: scraperError } = await supabase
    .rpc('get_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'scraper'
    });

  const { data: interactionTotal, error: interactionError } = await supabase
    .rpc('get_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'interaction'
    });

  // Get available balances
  const { data: scraperAvailable, error: scraperAvailableError } = await supabase
    .rpc('get_available_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'scraper'
    });

  const { data: interactionAvailable, error: interactionAvailableError } = await supabase
    .rpc('get_available_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'interaction'
    });

  if (scraperError || scraperAvailableError || interactionError || interactionAvailableError) {
    const error = scraperError || scraperAvailableError || interactionError || interactionAvailableError;
    console.error('Error fetching enhanced credit balances:', error);
    throw new Error(error.message);
  }

  const scraperTotalBalance = scraperTotal || 0;
  const scraperAvailableBalance = scraperAvailable || 0;
  const scraperHeld = scraperTotalBalance - scraperAvailableBalance;

  const interactionTotalBalance = interactionTotal || 0;
  const interactionAvailableBalance = interactionAvailable || 0;
  const interactionHeld = interactionTotalBalance - interactionAvailableBalance;

  return {
    scraper_credits: {
      total: scraperTotalBalance,
      held: scraperHeld,
      available: scraperAvailableBalance
    },
    interaction_credits: {
      total: interactionTotalBalance,
      held: interactionHeld,
      available: interactionAvailableBalance
    }
  };
}

// Get credit packages for top-up
export async function getCreditPackages() {
  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching credit packages:', error);
    throw error;
  }

  return data;
}