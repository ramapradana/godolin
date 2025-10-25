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
    
    // Get scraper credits total balance
    const { data: scraperData, error: scraperError } = await supabase
      .rpc('get_credit_balance', {
        p_user_id: userId,
        p_credit_type: 'scraper'
      });

    // Get scraper credits available balance (total - held)
    const { data: scraperAvailable, error: scraperAvailableError } = await supabase
      .rpc('get_available_credit_balance', {
        p_user_id: userId,
        p_credit_type: 'scraper'
      });

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

    if (scraperError || scraperAvailableError || interactionError || interactionAvailableError) {
      console.error('Error fetching credit balances:',
        scraperError || scraperAvailableError || interactionError || interactionAvailableError);
      return NextResponse.json({ error: 'Failed to fetch credit balances' }, { status: 500 });
    }

    // Calculate held amounts
    const scraperTotal = scraperData || 0;
    const scraperAvailableBalance = scraperAvailable || 0;
    const scraperHeld = scraperTotal - scraperAvailableBalance;

    const interactionTotal = interactionData || 0;
    const interactionAvailableBalance = interactionAvailable || 0;
    const interactionHeld = interactionTotal - interactionAvailableBalance;

    // Get active holds for additional context
    const { data: scraperHolds, error: holdsError } = await supabase
      .from('credit_holds')
      .select('id, amount, reference_id, status, expires_at, created_at')
      .eq('user_id', userId)
      .eq('credit_type', 'scraper')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    const { data: interactionHolds, error: interactionHoldsError } = await supabase
      .from('credit_holds')
      .select('id, amount, reference_id, status, expires_at, created_at')
      .eq('user_id', userId)
      .eq('credit_type', 'interaction')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (holdsError || interactionHoldsError) {
      console.error('Error fetching credit holds:', holdsError || interactionHoldsError);
      // Don't fail the request, but log the error
    }

    return NextResponse.json({
      scraper_credits: {
        total: scraperTotal,
        held: scraperHeld,
        available: scraperAvailableBalance
      },
      interaction_credits: {
        total: interactionTotal,
        held: interactionHeld,
        available: interactionAvailableBalance
      },
      holds: {
        scraper: scraperHolds || [],
        interaction: interactionHolds || []
      }
    });
  } catch (error) {
    console.error('Error in credits balance API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}