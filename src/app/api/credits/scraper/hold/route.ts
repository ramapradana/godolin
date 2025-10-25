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
    const { amount, reference_id, expires_in_minutes = 60 } = body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        error: 'Invalid amount. Amount must be a positive integer.',
        code: 'INVALID_AMOUNT'
      }, { status: 400 });
    }

    if (!reference_id) {
      return NextResponse.json({ 
        error: 'Reference ID is required.',
        code: 'MISSING_REFERENCE_ID'
      }, { status: 400 });
    }

    if (expires_in_minutes < 1 || expires_in_minutes > 1440) { // Max 24 hours
      return NextResponse.json({ 
        error: 'Expires in minutes must be between 1 and 1440.',
        code: 'INVALID_EXPIRATION'
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    try {
      // Create the credit hold
      const { data: holdId, error: holdError } = await supabase.rpc('hold_credits', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: amount,
        p_reference_id: reference_id,
        p_expires_in_minutes: expires_in_minutes
      });

      if (holdError) {
        console.error('Error holding credits:', holdError);
        
        // Check for insufficient credits error
        if (holdError.message.includes('Insufficient credits')) {
          // Extract available and required amounts from error message
          const match = holdError.message.match(/Available: (\d+), Required: (\d+)/);
          if (match) {
            const availableCredits = parseInt(match[1]);
            const requiredCredits = parseInt(match[2]);
            
            return NextResponse.json({ 
              error: 'Insufficient credits',
              code: 'INSUFFICIENT_CREDITS',
              available_credits: availableCredits,
              required_credits: requiredCredits
            }, { status: 402 });
          }
        }
        
        return NextResponse.json({ 
          error: 'Failed to hold credits',
          code: 'HOLD_FAILED',
          details: holdError.message
        }, { status: 500 });
      }

      // Get the hold details to return
      const { data: holdRecord, error: fetchError } = await supabase
        .from('credit_holds')
        .select('*')
        .eq('id', holdId)
        .single();

      if (fetchError) {
        console.error('Error fetching hold record:', fetchError);
        return NextResponse.json({ 
          error: 'Failed to retrieve hold details',
          code: 'FETCH_ERROR'
        }, { status: 500 });
      }

      // Log the hold operation
      console.log('Credit hold created', {
        userId,
        holdId,
        amount,
        reference_id,
        expires_at: holdRecord.expires_at
      });

      return NextResponse.json({
        hold_id: holdRecord.id,
        status: holdRecord.status,
        amount: holdRecord.amount,
        expires_at: holdRecord.expires_at,
        reference_id: holdRecord.reference_id,
        created_at: holdRecord.created_at
      });

    } catch (error) {
      console.error('Unexpected error in credit hold:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in credit hold API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}