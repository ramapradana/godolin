"use client";

import { createClient } from '@supabase/supabase-js';
import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

// Hook for getting current user
export function useCurrentUser() {
  const { isSignedIn, userId } = useAuth();
  return { isSignedIn, userId };
}

// Hook for user profile management
export function useUserProfile() {
  const { user } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('clerk_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) throw new Error('User not authenticated');

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from('users')
        .upsert({
          clerk_id: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          name: updates.name || user.fullName,
          phone: updates.phone,
          company_name: updates.company_name,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return data;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  return { profile, loading, error, updateProfile };
}

// Hook for subscription management
export function useUserSubscription() {
  const { userId } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
          throw error;
        }

        if (data) {
          setSubscription({
            ...data,
            plan: data.subscription_plans,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  return { subscription, loading, error };
}

// Hook for credit balances
export function useCreditBalances() {
  const { userId } = useAuth();
  const [balances, setBalances] = useState<CreditBalance>({ scraper_credits: 0, interaction_credits: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setBalances({ scraper_credits: 0, interaction_credits: 0 });
      setLoading(false);
      return;
    }

    const fetchBalances = async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
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
          throw scraperError || interactionError;
        }

        setBalances({
          scraper_credits: scraperData || 0,
          interaction_credits: interactionData || 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch credit balances');
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [userId]);

  return { balances, loading, error };
}

// Hook for credit transaction history
export function useCreditTransactionHistory(creditType: 'scraper' | 'interaction', limit: number = 50) {
  const { userId } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase
          .from('credit_ledger')
          .select('*')
          .eq('user_id', userId)
          .eq('credit_type', creditType)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        setTransactions(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [userId, creditType, limit]);

  return { transactions, loading, error };
}

// Function to get subscription plans
export async function getSubscriptionPlans() {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to fetch subscription plans');
  }
}

// Function to get credit packages
export async function getCreditPackages() {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to fetch credit packages');
  }
}

// Function to create trial subscription (called from API)
export async function createTrialSubscription(userId: string) {
  try {
    const response = await fetch('/api/subscriptions/create-trial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create trial subscription');
    }

    return await response.json();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to create trial subscription');
  }
}

// Function to upgrade subscription
export async function upgradeSubscription(planId: string) {
  try {
    const response = await fetch('/api/subscriptions/upgrade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planId }),
    });

    if (!response.ok) {
      throw new Error('Failed to upgrade subscription');
    }

    return await response.json();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to upgrade subscription');
  }
}

// Function to purchase credit top-up
export async function purchaseCreditTopUp(packageId: string) {
  try {
    const response = await fetch('/api/billing/topup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ packageId }),
    });

    if (!response.ok) {
      throw new Error('Failed to purchase credit top-up');
    }

    return await response.json();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to purchase credit top-up');
  }
}