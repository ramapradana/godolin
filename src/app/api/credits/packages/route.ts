import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      console.error('Error fetching credit packages:', error);
      return NextResponse.json({ error: 'Failed to fetch credit packages' }, { status: 500 });
    }

    return NextResponse.json({ packages: data });
  } catch (error) {
    console.error('Error in credit packages API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}