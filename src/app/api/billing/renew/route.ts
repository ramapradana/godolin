import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

// This endpoint should be called by a cron job monthly
// It should be secured with a secret key in production
export async function POST(request: NextRequest) {
  try {
    // Verify secret key (in production, use environment variable)
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.BILLING_CRON_SECRET;
    
    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get all subscriptions due for renewal today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { data: dueSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          name,
          price,
          scraper_credits,
          interaction_credits
        ),
        users!inner (
          email,
          name
        )
      `)
      .eq('status', 'active')
      .lte('current_period_end', today)
      .order('current_period_end', { ascending: true });

    if (fetchError) {
      console.error('Error fetching due subscriptions:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    const renewalResults = [];
    
    for (const subscription of dueSubscriptions || []) {
      try {
        // Simulate payment processing (in real implementation, integrate with Stripe/Midtrans)
        const paymentSuccessful = Math.random() > 0.05; // 95% success rate for demo
        
        const now = new Date();
        const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
        
        if (paymentSuccessful) {
          // Create invoice
          const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
              user_id: subscription.user_id,
              subscription_id: subscription.id,
              invoice_number: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              amount: subscription.subscription_plans.price,
              status: 'paid',
              line_items: {
                type: 'subscription_renewal',
                plan_name: subscription.subscription_plans.name,
                period: 'monthly',
                price: subscription.subscription_plans.price
              },
              paid_at: now.toISOString(),
            })
            .select()
            .single();

          if (invoiceError) {
            console.error('Error creating invoice:', invoiceError);
            continue;
          }

          // Update subscription
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({
              current_period_start: now.toISOString(),
              current_period_end: nextPeriodEnd.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', subscription.id);

          if (updateError) {
            console.error('Error updating subscription:', updateError);
            continue;
          }

          // Reset interaction credits
          await supabase.rpc('add_credit_transaction', {
            p_user_id: subscription.user_id,
            p_credit_type: 'interaction',
            p_amount: subscription.subscription_plans.interaction_credits,
            p_source: 'monthly_allocation',
            p_reference_id: invoice.id,
            p_description: `Monthly renewal - ${subscription.subscription_plans.interaction_credits} interaction credits`
          });

          // Add scraper credits (accumulative)
          await supabase.rpc('add_credit_transaction', {
            p_user_id: subscription.user_id,
            p_credit_type: 'scraper',
            p_amount: subscription.subscription_plans.scraper_credits,
            p_source: 'monthly_allocation',
            p_reference_id: invoice.id,
            p_description: `Monthly renewal - ${subscription.subscription_plans.scraper_credits} scraper credits`
          });

          // Create success notification
          await supabase
            .from('notifications')
            .insert({
              user_id: subscription.user_id,
              type: 'billing_success',
              title: 'Subscription Renewed Successfully',
              message: `Your ${subscription.subscription_plans.name} subscription has been renewed for another month. IDR ${subscription.subscription_plans.price.toLocaleString()} has been charged to your payment method.`,
            });

          renewalResults.push({
            subscription_id: subscription.id,
            user_email: subscription.users.email,
            status: 'success',
            invoice_id: invoice.id,
            amount: subscription.subscription_plans.price
          });

        } else {
          // Mark subscription as past due
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: now.toISOString(),
            })
            .eq('id', subscription.id);

          if (updateError) {
            console.error('Error updating subscription status:', updateError);
            continue;
          }

          // Create failed payment notification
          await supabase
            .from('notifications')
            .insert({
              user_id: subscription.user_id,
              type: 'billing_failed',
              title: 'Payment Failed',
              message: `We were unable to process your subscription renewal payment of IDR ${subscription.subscription_plans.price.toLocaleString()}. Please update your payment method to continue using the service.`,
            });

          renewalResults.push({
            subscription_id: subscription.id,
            user_email: subscription.users.email,
            status: 'failed',
            error: 'Payment processing failed'
          });
        }
      } catch (error) {
        console.error(`Error processing renewal for subscription ${subscription.id}:`, error);
        renewalResults.push({
          subscription_id: subscription.id,
          user_email: subscription.users?.email || 'unknown',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      processed: renewalResults.length,
      results: renewalResults,
      message: `Processed ${renewalResults.length} subscription renewals`
    });

  } catch (error) {
    console.error('Error in billing renewal API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET endpoint for testing renewal status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.BILLING_CRON_SECRET;
    
    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get recent renewals
    const { data: recentInvoices, error } = await supabase
      .from('invoices')
      .select(`
        *,
        subscriptions!inner (
          user_id,
          subscription_plans!inner (
            name
          )
        )
      `)
      .eq('status', 'paid')
      .like('line_items->>type', 'subscription_renewal')
      .order('paid_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching recent renewals:', error);
      return NextResponse.json({ error: 'Failed to fetch renewals' }, { status: 500 });
    }

    return NextResponse.json({
      recent_renewals: recentInvoices,
      total_processed: recentInvoices?.length || 0
    });

  } catch (error) {
    console.error('Error in billing renewal GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}