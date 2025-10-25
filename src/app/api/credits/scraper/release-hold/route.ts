import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hold_id, reason } = body;

    // Validate required fields
    if (!hold_id) {
      return NextResponse.json({ 
        error: 'Hold ID is required.',
        code: 'MISSING_HOLD_ID'
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    try {
      // First, verify the hold belongs to the user and is active
      const { data: holdRecord, error: fetchError } = await supabase
        .from('credit_holds')
        .select('*')
        .eq('id', hold_id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (fetchError || !holdRecord) {
        console.error('Hold not found or not accessible:', fetchError);
        return NextResponse.json({ 
          error: 'Hold not found or already processed',
          code: 'HOLD_NOT_FOUND'
        }, { status: 404 });
      }

      // Check if hold has expired
      if (new Date(holdRecord.expires_at) <= new Date()) {
        return NextResponse.json({ 
          error: 'Hold has expired',
          code: 'HOLD_EXPIRED'
        }, { status: 400 });
      }

      // Release the hold
      const { data: success, error: releaseError } = await supabase.rpc('release_credit_hold', {
        p_hold_id: hold_id,
        p_reason: reason || 'Hold released without specific reason'
      });

      if (releaseError) {
        console.error('Error releasing credit hold:', releaseError);
        return NextResponse.json({ 
          error: 'Failed to release credit hold',
          code: 'RELEASE_FAILED',
          details: releaseError.message
        }, { status: 500 });
      }

      // Get updated available balance
      const { data: availableBalance, error: balanceError } = await supabase
        .rpc('get_available_credit_balance', { 
          p_user_id: userId, 
          p_credit_type: 'scraper' 
        });

      if (balanceError) {
        console.error('Error fetching available balance:', balanceError);
      }

      // Get total balance for reference
      const { data: totalBalance, error: totalBalanceError } = await supabase
        .rpc('get_credit_balance', { 
          p_user_id: userId, 
          p_credit_type: 'scraper' 
        });

      if (totalBalanceError) {
        console.error('Error fetching total balance:', totalBalanceError);
      }

      // Get current held amount
      const { data: heldAmount, error: heldError } = await supabase
        .from('credit_holds')
        .select('amount')
        .eq('user_id', userId)
        .eq('credit_type', 'scraper')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString());

      let totalHeld = 0;
      if (!heldError && heldAmount) {
        totalHeld = heldAmount.reduce((sum: number, hold: any) => sum + hold.amount, 0);
      }

      // Log the release operation
      console.log('Credit hold released', {
        userId,
        hold_id,
        amount: holdRecord.amount,
        reason: reason || 'No reason provided',
        reference_id: holdRecord.reference_id
      });

      return NextResponse.json({
        success: true,
        hold_id: hold_id,
        status: 'released',
        amount_released: holdRecord.amount,
        reason: reason || 'Hold released',
        reference_id: holdRecord.reference_id,
        updated_balances: {
          total: totalBalance || 0,
          held: totalHeld,
          available: availableBalance || 0
        }
      });

    } catch (error) {
      console.error('Unexpected error in credit hold release:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in credit hold release API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}