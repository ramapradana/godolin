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
    const { search_criteria, estimated_credits = 50 } = body;

    if (!search_criteria) {
      return NextResponse.json({ error: 'Search criteria is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Step 1: Check available credits (including holds)
    const { data: availableBalance, error: balanceError } = await supabase
      .rpc('get_available_credit_balance', {
        p_user_id: userId,
        p_credit_type: 'scraper'
      });

    if (balanceError) {
      console.error('Error checking available credit balance:', balanceError);
      return NextResponse.json({ error: 'Failed to check credit balance' }, { status: 500 });
    }

    const availableCredits = availableBalance || 0;
    const requiredCredits = estimated_credits || 50;

    if (availableCredits < requiredCredits) {
      // Get total balance and held amount for better error message
      const { data: totalBalance } = await supabase
        .rpc('get_credit_balance', {
          p_user_id: userId,
          p_credit_type: 'scraper'
        });

      const heldCredits = (totalBalance || 0) - availableCredits;

      return NextResponse.json({
        error: 'Insufficient scraper credits',
        code: 'INSUFFICIENT_CREDITS',
        available_credits: availableCredits,
        required_credits: requiredCredits,
        total_credits: totalBalance || 0,
        held_credits: heldCredits
      }, { status: 402 });
    }

    // Step 2: Create lead search record
    const { data: searchRecord, error: searchError } = await supabase
      .from('lead_searches')
      .insert({
        user_id: userId,
        search_criteria,
        credits_used: 0, // Will be updated later
        status: 'pending',
      })
      .select()
      .single();

    if (searchError) {
      console.error('Error creating lead search record:', searchError);
      return NextResponse.json({ error: 'Failed to create search record' }, { status: 500 });
    }

    // Step 3: Place credit hold
    let holdId = null;
    try {
      const { data: holdIdResult, error: holdError } = await supabase.rpc('hold_credits', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: requiredCredits,
        p_reference_id: searchRecord.id,
        p_expires_in_minutes: 60 // 1 hour hold
      });

      if (holdError) {
        throw new Error(holdError.message);
      }

      holdId = holdIdResult;
    } catch (holdError) {
      console.error('Error holding credits:', holdError);
      
      // Clean up search record
      await supabase
        .from('lead_searches')
        .update({ status: 'failed', error_message: 'Failed to hold credits' })
        .eq('id', searchRecord.id);
      
      return NextResponse.json({
        error: 'Failed to hold credits',
        code: 'HOLD_FAILED',
        details: holdError instanceof Error ? holdError.message : 'Unknown error'
      }, { status: 500 });
    }

    // Step 4: Execute search
    try {
      const mockLeads = await generateMockLeads(search_criteria, requiredCredits);
      const actualCreditsUsed = Math.min(mockLeads.length, requiredCredits);
      
      // Step 5: Save leads to database
      const leadsToInsert = mockLeads.map(lead => ({
        search_id: searchRecord.id,
        ...lead
      }));

      const { error: leadsError } = await supabase
        .from('leads')
        .insert(leadsToInsert);

      if (leadsError) {
        throw leadsError;
      }

      // Step 6: Convert hold to deduction with actual amount
      try {
        const { data: transactionId, error: deductError } = await supabase.rpc('convert_hold_to_deduction', {
          p_hold_id: holdId,
          p_description: `Lead search - ${actualCreditsUsed} scraper credits`
        });
        
        if (deductError) {
          throw new Error(deductError.message);
        }

        // Refund difference if actual usage is less than hold amount
        let refundAmount = 0;
        if (actualCreditsUsed < requiredCredits) {
          refundAmount = requiredCredits - actualCreditsUsed;
          
          const { error: refundError } = await supabase.rpc('add_credit_transaction', {
            p_user_id: userId,
            p_credit_type: 'scraper',
            p_amount: refundAmount,
            p_source: 'refund',
            p_reference_id: holdId,
            p_description: `Refund - Partial credit usage (${actualCreditsUsed}/${requiredCredits} credits used)`
          });

          if (refundError) {
            console.error('Error refunding difference:', refundError);
            // Don't fail the request, but log the error for manual intervention
          }
        }

        // Update search record as completed
        await supabase
          .from('lead_searches')
          .update({
            status: 'completed',
            results_count: mockLeads.length,
            credits_used: actualCreditsUsed,
            updated_at: new Date().toISOString()
          })
          .eq('id', searchRecord.id);

        // Get updated balance
        const { data: updatedBalance } = await supabase
          .rpc('get_available_credit_balance', {
            p_user_id: userId,
            p_credit_type: 'scraper'
          });

        return NextResponse.json({
          search_id: searchRecord.id,
          status: 'completed',
          results_count: mockLeads.length,
          credits_used: actualCreditsUsed,
          credits_held: requiredCredits,
          credits_refunded: refundAmount,
          remaining_credits: updatedBalance || 0,
          hold_id: holdId,
          transaction_id: transactionId,
          leads: mockLeads
        });

      } catch (deductError) {
        console.error('Error converting hold to deduction:', deductError);
        
        // Release hold on deduction failure
        try {
          await supabase.rpc('release_credit_hold', {
            p_hold_id: holdId,
            p_reason: 'Failed to process credit deduction'
          });
        } catch (releaseError) {
          console.error('Error releasing credit hold:', releaseError);
        }
        
        throw deductError;
      }

    } catch (scraperError) {
      console.error('Error in scraper service:', scraperError);
      
      // Step 7: Release hold on search failure
      try {
        await supabase.rpc('release_credit_hold', {
          p_hold_id: holdId,
          p_reason: scraperError instanceof Error ? scraperError.message : 'Unknown error'
        });
      } catch (releaseError) {
        console.error('Error releasing credit hold:', releaseError);
      }

      // Update search record as failed
      await supabase
        .from('lead_searches')
        .update({
          status: 'failed',
          error_message: scraperError instanceof Error ? scraperError.message : 'Unknown error',
          updated_at: new Date().toISOString()
        })
        .eq('id', searchRecord.id);

      return NextResponse.json({
        error: 'Lead search failed',
        code: 'SEARCH_FAILED',
        search_id: searchRecord.id,
        credits_held: requiredCredits,
        credits_refunded: requiredCredits,
        hold_id: holdId,
        reason: scraperError instanceof Error ? scraperError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in scraper search API:', error);
    return NextResponse.json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

// Mock function to generate sample leads
function generateMockLeads(searchCriteria: any, count: number) {
  const industries = ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail'];
  const positions = ['CEO', 'CTO', 'Marketing Manager', 'Sales Director', 'Product Manager'];
  const companies = ['TechCorp', 'HealthPlus', 'FinanceHub', 'EduTech', 'RetailMax'];
  
  const leads = [];
  for (let i = 0; i < Math.min(count, 100); i++) { // Limit to 100 leads max
    leads.push({
      name: `Lead ${i + 1}`,
      email: `lead${i + 1}@example.com`,
      phone: `+123456789${i.toString().padStart(2, '0')}`,
      company: companies[Math.floor(Math.random() * companies.length)],
      position: positions[Math.floor(Math.random() * positions.length)],
      linkedin_url: `https://linkedin.com/in/lead${i + 1}`,
      source: 'scraper',
      additional_data: {
        industry: industries[Math.floor(Math.random() * industries.length)],
        location: 'Jakarta, Indonesia',
        company_size: Math.floor(Math.random() * 1000) + 50
      }
    });
  }
  
  return leads;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = await createSupabaseServerClient();
    
    // Get user's lead searches
    const { data: searches, error: searchesError } = await supabase
      .from('lead_searches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (searchesError) {
      console.error('Error fetching lead searches:', searchesError);
      return NextResponse.json({ error: 'Failed to fetch lead searches' }, { status: 500 });
    }

    return NextResponse.json({ searches });
  } catch (error) {
    console.error('Error in scraper search GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}