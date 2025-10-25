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
    const { hold_id, actual_amount, description } = body;

    // Validate required fields
    if (!hold_id) {
      return NextResponse.json({ 
        error: 'Hold ID is required.',
        code: 'MISSING_HOLD_ID'
      }, { status: 400 });
    }

    if (actual_amount !== undefined && (actual_amount < 0 || !Number.isInteger(actual_amount))) {
      return NextResponse.json({ 
        error: 'Actual amount must be a non-negative integer.',
        code: 'INVALID_AMOUNT'
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
        console.error('Interaction credit hold not found or not accessible:', fetchError);
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

      // Use actual_amount if provided, otherwise use the original hold amount
      const deductionAmount = actual_amount !== undefined ? actual_amount : holdRecord.amount;

      // If actual_amount is different from hold amount, we need to handle the difference
      if (actual_amount !== undefined && actual_amount !== holdRecord.amount) {
        if (actual_amount > holdRecord.amount) {
          return NextResponse.json({ 
            error: 'Actual amount cannot exceed hold amount',
            code: 'AMOUNT_EXCEEDS_HOLD',
            hold_amount: holdRecord.amount,
            actual_amount: actual_amount
          }, { status: 400 });
        }

        // For partial deductions, we'll convert the full hold and then refund the difference
        // This is simpler than trying to modify the hold amount
        const refundAmount = holdRecord.amount - actual_amount;
        
        // Convert the hold to deduction
        const { data: transactionId, error: deductError } = await supabase.rpc('convert_hold_to_deduction', {
          p_hold_id: hold_id,
          p_description: description || `WhatsApp message - ${actual_amount} interaction credits`
        });

        if (deductError) {
          console.error('Error converting interaction credit hold to deduction:', deductError);
          return NextResponse.json({ 
            error: 'Failed to deduct interaction credits',
            code: 'DEDUCTION_FAILED',
            details: deductError.message
          }, { status: 500 });
        }

        // Refund the difference if actual amount is less than hold amount
        if (refundAmount > 0) {
          const { error: refundError } = await supabase.rpc('add_credit_transaction', {
            p_user_id: userId,
            p_credit_type: 'interaction',
            p_amount: refundAmount,
            p_source: 'refund',
            p_reference_id: hold_id,
            p_description: `Refund - Partial credit usage (${actual_amount}/${holdRecord.amount} credits used)`
          });

          if (refundError) {
            console.error('Error refunding interaction credit difference:', refundError);
            // Don't fail the request, but log the error for manual intervention
          }
        }

        // Get updated balance
        const { data: updatedBalance, error: balanceError } = await supabase
          .rpc('get_credit_balance', { 
            p_user_id: userId, 
            p_credit_type: 'interaction' 
          });

        if (balanceError) {
          console.error('Error fetching updated interaction credit balance:', balanceError);
        }

        // Log the partial deduction operation
        console.log('Interaction credit hold converted to deduction (partial)', {
          userId,
          hold_id,
          originalAmount: holdRecord.amount,
          actualAmount: deductionAmount,
          refundAmount,
          transactionId
        });

        return NextResponse.json({
          transaction_id: transactionId,
          hold_id: hold_id,
          amount_deducted: deductionAmount,
          amount_refunded: refundAmount,
          remaining_balance: updatedBalance || 0,
          description: description || `WhatsApp message - ${actual_amount} interaction credits`
        });

      } else {
        // Full deduction - convert the entire hold
        const { data: transactionId, error: deductError } = await supabase.rpc('convert_hold_to_deduction', {
          p_hold_id: hold_id,
          p_description: description || `WhatsApp message - ${holdRecord.amount} interaction credits`
        });

        if (deductError) {
          console.error('Error converting interaction credit hold to deduction:', deductError);
          return NextResponse.json({ 
            error: 'Failed to deduct interaction credits',
            code: 'DEDUCTION_FAILED',
            details: deductError.message
          }, { status: 500 });
        }

        // Get updated balance
        const { data: updatedBalance, error: balanceError } = await supabase
          .rpc('get_credit_balance', { 
            p_user_id: userId, 
            p_credit_type: 'interaction' 
          });

        if (balanceError) {
          console.error('Error fetching updated interaction credit balance:', balanceError);
        }

        // Log the full deduction operation
        console.log('Interaction credit hold converted to deduction (full)', {
          userId,
          hold_id,
          amount: deductionAmount,
          transactionId
        });

        return NextResponse.json({
          transaction_id: transactionId,
          hold_id: hold_id,
          amount_deducted: deductionAmount,
          remaining_balance: updatedBalance || 0,
          description: description || `WhatsApp message - ${holdRecord.amount} interaction credits`
        });
      }

    } catch (error) {
      console.error('Unexpected error in interaction credit deduction:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in interaction credit deduction API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}