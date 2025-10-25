import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Check if user already has a subscription
    const { data: existingSub, error: existingError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Error checking existing subscription:', existingError);
      return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
    }

    if (existingSub) {
      return NextResponse.json({ error: 'User already has a subscription' }, { status: 400 });
    }

    // Get trial plan
    const { data: trialPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', 'Trial')
      .single();

    if (planError || !trialPlan) {
      console.error('Error fetching trial plan:', planError);
      return NextResponse.json({ error: 'Trial plan not found' }, { status: 404 });
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
      return NextResponse.json({ error: 'Failed to create trial subscription' }, { status: 500 });
    }

    // Allocate initial credits
    try {
      // Add scraper credits
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: trialPlan.scraper_credits,
        p_source: 'trial_allocation',
        p_description: `Trial allocation - ${trialPlan.scraper_credits} scraper credits`
      });

      // Add interaction credits
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'interaction',
        p_amount: trialPlan.interaction_credits,
        p_source: 'trial_allocation',
        p_description: `Trial allocation - ${trialPlan.interaction_credits} interaction credits`
      });
    } catch (creditError) {
      console.error('Error allocating trial credits:', creditError);
      // Don't fail the subscription creation if credit allocation fails
    }

    // Create welcome notification
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'welcome',
        title: 'Welcome to AI Marketing Platform!',
        message: 'Your trial account has been created with 100 scraper credits and 150 interaction credits. Get started with lead generation!',
      });

    return NextResponse.json({
      subscription: {
        ...subscription,
        plan: trialPlan,
      },
      message: 'Trial subscription created successfully'
    });
  } catch (error) {
    console.error('Error in create-trial API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}