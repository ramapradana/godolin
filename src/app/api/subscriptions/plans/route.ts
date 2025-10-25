import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      console.error('Error fetching subscription plans:', error);
      return NextResponse.json({ error: 'Failed to fetch subscription plans' }, { status: 500 });
    }

    return NextResponse.json({ plans: data });
  } catch (error) {
    console.error('Error in subscription plans API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}