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
    
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    // Get user subscription with plan details
    const { data: subscription, error: subError } = await supabase
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

    if (subError && subError.code !== 'PGRST116') {
      console.error('Error fetching user subscription:', subError);
      return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
    }

    // Get credit balances
    const { data: scraperData, error: scraperError } = await supabase
      .rpc('get_credit_balance', { 
        p_user_id: userId, 
        p_credit_type: 'scraper' 
      });

    const { data: interactionData, error: interactionError } = await supabase
      .rpc('get_credit_balance', { 
        p_user_id: userId, 
        p_credit_type: 'interaction' 
      });

    if (scraperError || interactionError) {
      console.error('Error fetching credit balances:', scraperError || interactionError);
      return NextResponse.json({ error: 'Failed to fetch credit balances' }, { status: 500 });
    }

    const response = {
      profile,
      subscription: subscription ? {
        ...subscription,
        plan: subscription.subscription_plans,
      } : null,
      credit_balances: {
        scraper_credits: scraperData || 0,
        interaction_credits: interactionData || 0,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in user API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, company_name } = body;

    const supabase = await createSupabaseServerClient();
    
    // Get user email from Clerk
    const clerkUser = await auth();
    const email = clerkUser.email;

    // Create or update user profile
    const { data, error } = await supabase
      .from('users')
      .upsert({
        clerk_id: userId,
        email: email || '',
        name,
        phone,
        company_name,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Error in user API POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}