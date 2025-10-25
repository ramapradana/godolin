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
    const { packageId } = body;

    if (!packageId) {
      return NextResponse.json({ error: 'Package ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get credit package details
    const { data: creditPackage, error: packageError } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (packageError || !creditPackage) {
      console.error('Error fetching credit package:', packageError);
      return NextResponse.json({ error: 'Credit package not found' }, { status: 404 });
    }

    // Simulate payment processing (in real implementation, this would integrate with Stripe/Midtrans)
    const paymentSuccessful = true; // Mock payment success
    
    if (!paymentSuccessful) {
      return NextResponse.json({ error: 'Payment failed' }, { status: 400 });
    }

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        amount: creditPackage.price,
        status: 'paid',
        line_items: {
          type: 'credit_topup',
          package_name: creditPackage.name,
          scraper_credits: creditPackage.scraper_credits,
          price: creditPackage.price
        },
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    // Add credits to user account
    try {
      await supabase.rpc('add_credit_transaction', {
        p_user_id: userId,
        p_credit_type: 'scraper',
        p_amount: creditPackage.scraper_credits,
        p_source: 'topup_purchase',
        p_reference_id: invoice.id,
        p_description: `Top-up purchase - ${creditPackage.scraper_credits} scraper credits`
      });
    } catch (creditError) {
      console.error('Error adding credits:', creditError);
      return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 });
    }

    // Create notification
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'billing_success',
        title: 'Credit Purchase Successful',
        message: `You have successfully purchased ${creditPackage.scraper_credits} scraper credits for IDR ${creditPackage.price.toLocaleString()}.`,
      });

    return NextResponse.json({
      invoice,
      credits_added: creditPackage.scraper_credits,
      message: 'Credit top-up successful'
    });

  } catch (error) {
    console.error('Error in billing top-up API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}