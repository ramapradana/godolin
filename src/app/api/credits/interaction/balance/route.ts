import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    try {
      // Get interaction credits total balance
      const { data: interactionData, error: interactionError } = await supabase
        .rpc('get_credit_balance', {
          p_user_id: userId,
          p_credit_type: 'interaction'
        });

      // Get interaction credits available balance (total - held)
      const { data: interactionAvailable, error: interactionAvailableError } = await supabase
        .rpc('get_available_credit_balance', {
          p_user_id: userId,
          p_credit_type: 'interaction'
        });

      if (interactionError || interactionAvailableError) {
        console.error('Error fetching interaction credit balances:',
          interactionError || interactionAvailableError);
        return NextResponse.json({ error: 'Failed to fetch interaction credit balances' }, { status: 500 });
      }

      const interactionTotal = interactionData || 0;
      const interactionAvailableBalance = interactionAvailable || 0;
      const interactionHeld = interactionTotal - interactionAvailableBalance;

      // Get active holds for additional context
      const { data: interactionHolds, error: holdsError } = await supabase
        .from('credit_holds')
        .select('id, amount, reference_id, status, expires_at, created_at')
        .eq('user_id', userId)
        .eq('credit_type', 'interaction')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10); // Show last 10 active holds

      if (holdsError) {
        console.error('Error fetching interaction credit holds:', holdsError);
        // Don't fail the request, but log the error
      }

      return NextResponse.json({
        interaction_credits: {
          total: interactionTotal,
          held: interactionHeld,
          available: interactionAvailableBalance
        },
        holds: {
          active: interactionHolds || []
        }
      });

    } catch (error) {
      console.error('Unexpected error in interaction credit balance API:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in interaction credit balance API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}