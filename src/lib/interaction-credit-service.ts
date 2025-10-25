import { createSupabaseServerClient } from '@/lib/supabase';

export async function holdInteractionCredits(
  userId: string,
  amount: number,
  referenceId: string,
  expiresInMinutes: number = 30
) {
  const supabase = await createSupabaseServerClient();
  
  const { data: holdId, error } = await supabase.rpc('hold_credits', {
    p_user_id: userId,
    p_credit_type: 'interaction',
    p_amount: amount,
    p_reference_id: referenceId,
    p_expires_in_minutes: expiresInMinutes
  });

  if (error) {
    throw new Error(`Failed to hold interaction credits: ${error.message}`);
  }

  return holdId;
}

export async function deductInteractionCredits(
  holdId: string,
  description?: string
) {
  const supabase = await createSupabaseServerClient();
  
  const { data: transactionId, error } = await supabase.rpc('convert_hold_to_deduction', {
    p_hold_id: holdId,
    p_description: description
  });

  if (error) {
    throw new Error(`Failed to deduct interaction credits: ${error.message}`);
  }

  return transactionId;
}

export async function releaseInteractionCreditHold(
  holdId: string,
  reason?: string
) {
  const supabase = await createSupabaseServerClient();
  
  const { error } = await supabase.rpc('release_credit_hold', {
    p_hold_id: holdId,
    p_reason: reason
  });

  if (error) {
    throw new Error(`Failed to release interaction credit hold: ${error.message}`);
  }

  return true;
}

export async function getInteractionCreditBalance(userId: string) {
  const supabase = await createSupabaseServerClient();
  
  const { data: balance, error } = await supabase.rpc('get_credit_balance', {
    p_user_id: userId,
    p_credit_type: 'interaction'
  });

  if (error) {
    throw new Error(`Failed to get interaction credit balance: ${error.message}`);
  }

  return balance || 0;
}

export async function getAvailableInteractionCreditBalance(userId: string) {
  const supabase = await createSupabaseServerClient();
  
  const { data: availableBalance, error } = await supabase.rpc('get_available_credit_balance', {
    p_user_id: userId,
    p_credit_type: 'interaction'
  });

  if (error) {
    throw new Error(`Failed to get available interaction credit balance: ${error.message}`);
  }

  return availableBalance || 0;
}