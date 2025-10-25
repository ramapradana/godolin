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

      // Release the hold
      const { error: releaseError } = await supabase.rpc('release_credit_hold', {
        p_hold_id: hold_id,
        p_reason: reason || null
      });

      if (releaseError) {
        console.error('Error releasing interaction credit hold:', releaseError);
        return NextResponse.json({ 
          error: 'Failed to release interaction credit hold',
          code: 'RELEASE_FAILED',
          details: releaseError.message
        }, { status: 500 });
      }

      // Log the release operation
      console.log('Interaction credit hold released', {
        userId,
        hold_id,
        amount: holdRecord.amount,
        reference_id: holdRecord.reference_id,
        reason: reason || 'No reason provided'
      });

      return NextResponse.json({
        success: true,
        hold_id: holdRecord.id,
        status: 'released',
        amount: holdRecord.amount,
        reference_id: holdRecord.reference_id,
        reason: reason || 'No reason provided',
        released_at: new Date().toISOString()
      });

    } catch (error) {
      console.error('Unexpected error in interaction credit hold release:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in interaction credit hold release API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}