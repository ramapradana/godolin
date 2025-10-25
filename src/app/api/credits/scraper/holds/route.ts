import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'active' | 'converted' | 'released' | 'expired' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = await createSupabaseServerClient();
    
    let query = supabase
      .from('credit_holds')
      .select('*')
      .eq('user_id', userId)
      .eq('credit_type', 'scraper')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: holds, error: holdsError } = await query;

    if (holdsError) {
      console.error('Error fetching credit holds:', holdsError);
      return NextResponse.json({ error: 'Failed to fetch credit holds' }, { status: 500 });
    }

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('credit_holds')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('credit_type', 'scraper');

    if (countError) {
      console.error('Error counting credit holds:', countError);
    }

    return NextResponse.json({
      holds: holds || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error) {
    console.error('Error in credit holds API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}