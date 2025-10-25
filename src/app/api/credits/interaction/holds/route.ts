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
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate limit and offset
    if (limit < 1 || limit > 100) {
      return NextResponse.json({ 
        error: 'Limit must be between 1 and 100.',
        code: 'INVALID_LIMIT'
      }, { status: 400 });
    }

    if (offset < 0) {
      return NextResponse.json({ 
        error: 'Offset must be a non-negative integer.',
        code: 'INVALID_OFFSET'
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    try {
      let query = supabase
        .from('credit_holds')
        .select('*')
        .eq('user_id', userId)
        .eq('credit_type', 'interaction')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter by status if provided
      if (status) {
        const validStatuses = ['active', 'converted', 'released', 'expired'];
        if (!validStatuses.includes(status)) {
          return NextResponse.json({ 
            error: 'Invalid status. Must be one of: active, converted, released, expired.',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        query = query.eq('status', status);
      }

      const { data: holds, error: holdsError } = await query;

      if (holdsError) {
        console.error('Error fetching interaction credit holds:', holdsError);
        return NextResponse.json({ 
          error: 'Failed to fetch interaction credit holds',
          code: 'HOLDS_FETCH_FAILED'
        }, { status: 500 });
      }

      // Get total count for pagination
      let countQuery = supabase
        .from('credit_holds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('credit_type', 'interaction');

      if (status) {
        countQuery = countQuery.eq('status', status);
      }

      const { count: totalCount, error: countError } = await countQuery;

      if (countError) {
        console.error('Error counting interaction credit holds:', countError);
        // Don't fail the request, but log the error
      }

      return NextResponse.json({
        holds: holds || [],
        total: totalCount || 0,
        limit,
        offset,
        has_more: (offset + limit) < (totalCount || 0)
      });

    } catch (error) {
      console.error('Unexpected error in interaction credit holds API:', error);
      return NextResponse.json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in interaction credit holds API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}