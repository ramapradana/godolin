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
    const { planId } = body;

    if (!planId) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get the new plan details
    const { data: newPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !newPlan) {
      console.error('Error fetching plan:', planError);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Get current subscription
    const { data: currentSub, error: currentError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (currentError && currentError.code !== 'PGRST116') {
      console.error('Error fetching current subscription:', currentError);
      return NextResponse.json({ error: 'Failed to fetch current subscription' }, { status: 500 });
    }

    // Simulate payment processing (in real implementation, this would integrate with Stripe/Midtrans)
    const paymentSuccessful = true; // Mock payment success
    
    if (!paymentSuccessful) {
      return NextResponse.json({ error: 'Payment failed' }, { status: 400 });
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    if (currentSub) {
      // Update existing subscription
      const { data: updatedSub, error: updateError } = await supabase
        .from('subscriptions')
        .update({
          plan_id: planId,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', currentSub.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating subscription:', updateError);
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
      }

      // Reset interaction credits for new billing period
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'interaction',
        p_amount: newPlan.interaction_credits,
        p_source: 'monthly_allocation',
        p_description: `Monthly allocation - ${newPlan.interaction_credits} interaction credits`
      });

      // Add scraper credits (accumulative)
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: newPlan.scraper_credits,
        p_source: 'monthly_allocation',
        p_description: `Monthly allocation - ${newPlan.scraper_credits} scraper credits`
      });

      return NextResponse.json({
        subscription: {
          ...updatedSub,
          plan: newPlan,
        },
        message: 'Subscription upgraded successfully'
      });

    } else {
      // Create new subscription
      const { data: newSub, error: createError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating subscription:', createError);
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
      }

      // Allocate initial credits
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'interaction',
        p_amount: newPlan.interaction_credits,
        p_source: 'monthly_allocation',
        p_description: `Initial allocation - ${newPlan.interaction_credits} interaction credits`
      });

      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: newPlan.scraper_credits,
        p_source: 'monthly_allocation',
        p_description: `Initial allocation - ${newPlan.scraper_credits} scraper credits`
      });

      return NextResponse.json({
        subscription: {
          ...newSub,
          plan: newPlan,
        },
        message: 'Subscription created successfully'
      });
    }

  } catch (error) {
    console.error('Error in subscription upgrade API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}