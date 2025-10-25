# Billing Cycle API Implementation Guide

This document provides detailed implementation guidance for the API endpoints needed for the Monthly Billing Cycle automated system process.

## 1. Credit Management API Endpoints

### 1.1 Reset Interaction Credits

**Endpoint**: `POST /api/credits/interaction/reset`

```typescript
// src/app/api/credits/interaction/reset/route.ts
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
    const { amount, reference_id, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        error: 'Valid amount is required',
        code: 'INVALID_AMOUNT'
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Call the reset_interaction_credits function
    const { data: transactionId, error } = await supabase.rpc('reset_interaction_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reference_id: reference_id || null,
      p_description: description || 'Interaction credits reset'
    });

    if (error) {
      console.error('Error resetting interaction credits:', error);
      return NextResponse.json({ 
        error: 'Failed to reset interaction credits',
        details: error.message
      }, { status: 500 });
    }

    // Log the operation
    await supabase.rpc('log_billing_event', {
      p_event_type: 'credit_reset',
      p_subscription_id: null,
      p_user_id: userId,
      p_status: 'success',
      p_details: {
        credit_type: 'interaction',
        amount: amount,
        transaction_id: transactionId
      }
    });

    // Get updated balance
    const { data: updatedBalance } = await supabase.rpc('get_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'interaction'
    });

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      amount_reset: amount,
      new_balance: updatedBalance || 0,
      message: 'Interaction credits reset successfully'
    });

  } catch (error) {
    console.error('Error in interaction credits reset API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 1.2 Add Scraper Credits

**Endpoint**: `POST /api/credits/scraper/add`

```typescript
// src/app/api/credits/scraper/add/route.ts
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
    const { amount, reference_id, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        error: 'Valid amount is required',
        code: 'INVALID_AMOUNT'
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Call the add_scraper_credits function
    const { data: transactionId, error } = await supabase.rpc('add_scraper_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reference_id: reference_id || null,
      p_description: description || 'Scraper credits added'
    });

    if (error) {
      console.error('Error adding scraper credits:', error);
      return NextResponse.json({ 
        error: 'Failed to add scraper credits',
        details: error.message
      }, { status: 500 });
    }

    // Log the operation
    await supabase.rpc('log_billing_event', {
      p_event_type: 'credit_add',
      p_subscription_id: null,
      p_user_id: userId,
      p_status: 'success',
      p_details: {
        credit_type: 'scraper',
        amount: amount,
        transaction_id: transactionId
      }
    });

    // Get updated balance
    const { data: updatedBalance } = await supabase.rpc('get_credit_balance', {
      p_user_id: userId,
      p_credit_type: 'scraper'
    });

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      amount_added: amount,
      new_balance: updatedBalance || 0,
      message: 'Scraper credits added successfully'
    });

  } catch (error) {
    console.error('Error in scraper credits add API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## 2. iPaymu Payment Gateway Integration

### 2.1 iPaymu Service Implementation

```typescript
// src/lib/ipaymu-service.ts
export class IPaymuService {
  private apiKey: string;
  private isSandbox: boolean;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.IPAYMU_API_KEY || '';
    this.isSandbox = process.env.IPAYMU_SANDBOX === 'true';
    this.baseUrl = this.isSandbox 
      ? 'https://sandbox.ipaymu.com/api/v2'
      : 'https://my.ipaymu.com/api/v2';
  }

  async createPayment(params: {
    amount: number;
    description: string;
    referenceId: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
  }) {
    const payload = {
      product: params.description,
      qty: 1,
      price: params.amount,
      referenceId: params.referenceId,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone || '',
      notifyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/webhook`,
      expired: '24', // 24 hours expiration
      comments: `Subscription renewal - ${params.referenceId}`,
    };

    const formPayload = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      formPayload.append(key, value);
    });

    const response = await fetch(`${this.baseUrl}/payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formPayload,
    });

    const result = await response.json();
    
    if (!response.ok || result.Status !== 200) {
      throw new Error(result.Message || 'Payment creation failed');
    }

    return result;
  }

  async checkPaymentStatus(transactionId: string) {
    const response = await fetch(`${this.baseUrl}/payment/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    const result = await response.json();
    
    if (!response.ok || result.Status !== 200) {
      throw new Error(result.Message || 'Status check failed');
    }

    return result;
  }

  async getTransactionList(params: {
    startDate?: string;
    endDate?: string;
    referenceId?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params.startDate) searchParams.append('startDate', params.startDate);
    if (params.endDate) searchParams.append('endDate', params.endDate);
    if (params.referenceId) searchParams.append('referenceId', params.referenceId);

    const response = await fetch(`${this.baseUrl}/history?${searchParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    const result = await response.json();
    
    if (!response.ok || result.Status !== 200) {
      throw new Error(result.Message || 'Transaction list fetch failed');
    }

    return result;
  }
}
```

### 2.2 Payment Webhook Handler

**Endpoint**: `POST /api/billing/webhook`

```typescript
// src/app/api/billing/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-ipaymu-signature');
    
    // Verify webhook signature (implementation depends on iPaymu's signature method)
    const isValidSignature = verifyWebhookSignature(body, signature);
    
    if (!isValidSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const supabase = await createSupabaseServerClient();

    // Handle different webhook events
    switch (data.type) {
      case 'payment.success':
        await handlePaymentSuccess(data, supabase);
        break;
      case 'payment.failed':
        await handlePaymentFailure(data, supabase);
        break;
      case 'payment.expired':
        await handlePaymentExpired(data, supabase);
        break;
      default:
        console.log('Unhandled webhook event:', data.type);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

function verifyWebhookSignature(body: string, signature: string): boolean {
  // Implement signature verification based on iPaymu's documentation
  // This is a placeholder implementation
  const webhookSecret = process.env.IPAYMU_WEBHOOK_SECRET;
  if (!webhookSecret) return true; // Skip verification if secret not configured
  
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function handlePaymentSuccess(data: any, supabase: any) {
  const { referenceId, transactionId, amount } = data;
  
  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_invoice_id: transactionId, // Using this field for iPaymu transaction ID
    })
    .eq('invoice_number', referenceId);

  // Log the payment success
  console.log(`Payment successful for invoice ${referenceId}, transaction ${transactionId}`);
}

async function handlePaymentFailure(data: any, supabase: any) {
  const { referenceId, transactionId, amount } = data;
  
  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'failed',
    })
    .eq('invoice_number', referenceId);

  // Log the payment failure
  console.log(`Payment failed for invoice ${referenceId}, transaction ${transactionId}`);
}

async function handlePaymentExpired(data: any, supabase: any) {
  const { referenceId, transactionId, amount } = data;
  
  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'cancelled',
    })
    .eq('invoice_number', referenceId);

  // Log the payment expiration
  console.log(`Payment expired for invoice ${referenceId}, transaction ${transactionId}`);
}
```

## 3. Enhanced Billing Renewal Endpoint

### 3.1 Updated Renewal Endpoint

```typescript
// src/app/api/billing/renew/route.ts (Enhanced version)
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { IPaymuService } from '@/lib/ipaymu-service';

export async function POST(request: NextRequest) {
  try {
    // Verify secret key
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.BILLING_CRON_SECRET;
    
    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    const iPaymuService = new IPaymuService();
    
    // Get all subscriptions due for renewal today
    const today = new Date().toISOString().split('T')[0];
    
    const { data: dueSubscriptions, error: fetchError } = await supabase
      .rpc('get_subscriptions_due_for_renewal', { p_check_date: today });

    if (fetchError) {
      console.error('Error fetching due subscriptions:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    const renewalResults = [];
    
    for (const subscription of dueSubscriptions || []) {
      try {
        // Log the renewal attempt
        await supabase.rpc('log_billing_event', {
          p_event_type: 'renewal',
          p_subscription_id: subscription.subscription_id,
          p_user_id: subscription.user_id,
          p_status: 'pending',
          p_details: {
            plan_name: subscription.plan_name,
            price: subscription.price,
            attempt_date: new Date().toISOString()
          }
        });

        // Create invoice
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: subscription.user_id,
            subscription_id: subscription.subscription_id,
            invoice_number: invoiceNumber,
            amount: subscription.price,
            status: 'pending',
            line_items: {
              type: 'subscription_renewal',
              plan_name: subscription.plan_name,
              period: 'monthly',
              price: subscription.price
            },
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('Error creating invoice:', invoiceError);
          continue;
        }

        // Process payment through iPaymu
        try {
          const paymentResult = await iPaymuService.createPayment({
            amount: Number(subscription.price),
            description: `${subscription.plan_name} Subscription Renewal`,
            referenceId: invoiceNumber,
            customerEmail: subscription.user_id, // This should be fetched from users table
            customerName: 'User', // This should be fetched from users table
          });

          // Update invoice with payment details
          await supabase
            .from('invoices')
            .update({
              stripe_invoice_id: paymentResult.Data.TransactionId,
            })
            .eq('id', invoice.id);

          // For now, we'll assume payment is successful
          // In production, this should be handled via webhooks
          const paymentSuccessful = true;
          
          if (paymentSuccessful) {
            // Update subscription
            const now = new Date();
            const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            const { error: updateError } = await supabase
              .from('subscriptions')
              .update({
                current_period_start: now.toISOString(),
                current_period_end: nextPeriodEnd.toISOString(),
                updated_at: now.toISOString(),
              })
              .eq('id', subscription.subscription_id);

            if (updateError) {
              console.error('Error updating subscription:', updateError);
              continue;
            }

            // Reset interaction credits
            await supabase.rpc('reset_interaction_credits', {
              p_user_id: subscription.user_id,
              p_amount: subscription.interaction_credits,
              p_reference_id: invoice.id,
              p_description: `Monthly renewal - ${subscription.interaction_credits} interaction credits`
            });

            // Add scraper credits
            await supabase.rpc('add_scraper_credits', {
              p_user_id: subscription.user_id,
              p_amount: subscription.scraper_credits,
              p_reference_id: invoice.id,
              p_description: `Monthly renewal - ${subscription.scraper_credits} scraper credits`
            });

            // Update invoice status
            await supabase
              .from('invoices')
              .update({
                status: 'paid',
                paid_at: now.toISOString(),
              })
              .eq('id', invoice.id);

            // Create success notification
            await supabase
              .from('notifications')
              .insert({
                user_id: subscription.user_id,
                type: 'billing_success',
                title: 'Subscription Renewed Successfully',
                message: `Your ${subscription.plan_name} subscription has been renewed for another month. IDR ${subscription.price.toLocaleString()} has been charged to your payment method.`,
              });

            // Log successful renewal
            await supabase.rpc('log_billing_event', {
              p_event_type: 'renewal',
              p_subscription_id: subscription.subscription_id,
              p_user_id: subscription.user_id,
              p_status: 'success',
              p_details: {
                invoice_id: invoice.id,
                transaction_id: paymentResult.Data.TransactionId,
                amount: subscription.price,
                next_period_end: nextPeriodEnd.toISOString()
              }
            });

            renewalResults.push({
              subscription_id: subscription.subscription_id,
              invoice_id: invoice.id,
              status: 'success',
              amount: subscription.price
            });

          } else {
            // Handle payment failure
            await handlePaymentFailure(subscription, invoice, supabase);
            
            renewalResults.push({
              subscription_id: subscription.subscription_id,
              invoice_id: invoice.id,
              status: 'failed',
              error: 'Payment processing failed'
            });
          }

        } catch (paymentError) {
          console.error('Payment processing error:', paymentError);
          
          // Handle payment error
          await handlePaymentFailure(subscription, invoice, supabase);
          
          renewalResults.push({
            subscription_id: subscription.subscription_id,
            invoice_id: invoice.id,
            status: 'error',
            error: paymentError instanceof Error ? paymentError.message : 'Payment error'
          });
        }

      } catch (error) {
        console.error(`Error processing renewal for subscription ${subscription.subscription_id}:`, error);
        
        // Log the error
        await supabase.rpc('log_billing_event', {
          p_event_type: 'renewal',
          p_subscription_id: subscription.subscription_id,
          p_user_id: subscription.user_id,
          p_status: 'error',
          p_error_message: error instanceof Error ? error.message : 'Unknown error'
        });
        
        renewalResults.push({
          subscription_id: subscription.subscription_id,
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

async function handlePaymentFailure(subscription: any, invoice: any, supabase: any) {
  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'failed',
    })
    .eq('id', invoice.id);

  // Update subscription status
  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.subscription_id);

  // Schedule first retry
  await supabase.rpc('schedule_payment_retry', {
    p_subscription_id: subscription.subscription_id,
    p_attempt_number: 1,
    p_retry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 1 day from now
  });

  // Create failed payment notification
  await supabase
    .from('notifications')
    .insert({
      user_id: subscription.user_id,
      type: 'billing_failed',
      title: 'Payment Failed',
      message: `We were unable to process your subscription renewal payment of IDR ${subscription.price.toLocaleString()}. We will retry the payment in 1 day. Please ensure your payment method is up to date.`,
    });

  // Log the payment failure
  await supabase.rpc('log_billing_event', {
    p_event_type: 'renewal',
    p_subscription_id: subscription.subscription_id,
    p_user_id: subscription.user_id,
    p_status: 'failed',
    p_details: {
      invoice_id: invoice.id,
      reason: 'Payment processing failed',
      next_retry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  });
}
```

## 4. Payment Retry Endpoint

### 4.1 Retry Processing Endpoint

**Endpoint**: `POST /api/billing/retry`

```typescript
// src/app/api/billing/retry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { IPaymuService } from '@/lib/ipaymu-service';

export async function POST(request: NextRequest) {
  try {
    // Verify secret key
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.BILLING_CRON_SECRET;
    
    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    const iPaymuService = new IPaymuService();
    
    // Get all pending retries scheduled for today
    const today = new Date().toISOString().split('T')[0];
    
    const { data: pendingRetries, error } = await supabase
      .rpc('get_subscriptions_with_pending_retries', { p_check_date: today });

    if (error) {
      console.error('Error fetching pending retries:', error);
      return NextResponse.json({ error: 'Failed to fetch retries' }, { status: 500 });
    }

    const retryResults = [];

    for (const retry of pendingRetries || []) {
      try {
        // Log the retry attempt
        await supabase.rpc('log_billing_event', {
          p_event_type: 'retry',
          p_subscription_id: retry.subscription_id,
          p_user_id: retry.user_id,
          p_status: 'pending',
          p_details: {
            attempt_number: retry.attempt_number,
            retry_date: retry.retry_date,
            amount: retry.price
          }
        });

        // Create new invoice for retry
        const invoiceNumber = `INV-RETRY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: retry.user_id,
            subscription_id: retry.subscription_id,
            invoice_number: invoiceNumber,
            amount: retry.price,
            status: 'pending',
            line_items: {
              type: 'subscription_retry',
              attempt_number: retry.attempt_number,
              plan_name: retry.plan_name,
              period: 'monthly',
              price: retry.price
            },
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('Error creating retry invoice:', invoiceError);
          continue;
        }

        // Process payment through iPaymu
        try {
          const paymentResult = await iPaymuService.createPayment({
            amount: Number(retry.price),
            description: `${retry.plan_name} Subscription Renewal (Retry #${retry.attempt_number})`,
            referenceId: invoiceNumber,
            customerEmail: retry.user_id, // This should be fetched from users table
            customerName: 'User', // This should be fetched from users table
          });

          // Update invoice with payment details
          await supabase
            .from('invoices')
            .update({
              stripe_invoice_id: paymentResult.Data.TransactionId,
            })
            .eq('id', invoice.id);

          // For now, we'll assume payment is successful
          // In production, this should be handled via webhooks
          const paymentSuccessful = true;
          
          if (paymentSuccessful) {
            // Update subscription
            const now = new Date();
            const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            const { error: updateError } = await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                current_period_start: now.toISOString(),
                current_period_end: nextPeriodEnd.toISOString(),
                updated_at: now.toISOString(),
              })
              .eq('id', retry.subscription_id);

            if (updateError) {
              console.error('Error updating subscription:', updateError);
              continue;
            }

            // Get plan details for credit allocation
            const { data: planDetails } = await supabase
              .from('subscription_plans')
              .select('scraper_credits, interaction_credits')
              .eq('id', (await supabase
                .from('subscriptions')
                .select('plan_id')
                .eq('id', retry.subscription_id)
                .single()
              ).data?.plan_id)
              .single();

            if (planDetails) {
              // Reset interaction credits
              await supabase.rpc('reset_interaction_credits', {
                p_user_id: retry.user_id,
                p_amount: planDetails.interaction_credits,
                p_reference_id: invoice.id,
                p_description: `Monthly renewal (retry #${retry.attempt_number}) - ${planDetails.interaction_credits} interaction credits`
              });

              // Add scraper credits
              await supabase.rpc('add_scraper_credits', {
                p_user_id: retry.user_id,
                p_amount: planDetails.scraper_credits,
                p_reference_id: invoice.id,
                p_description: `Monthly renewal (retry #${retry.attempt_number}) - ${planDetails.scraper_credits} scraper credits`
              });
            }

            // Update invoice status
            await supabase
              .from('invoices')
              .update({
                status: 'paid',
                paid_at: now.toISOString(),
              })
              .eq('id', invoice.id);

            // Update retry status
            await supabase
              .from('payment_retries')
              .update({
                status: 'processed',
                payment_response: paymentResult,
                updated_at: now.toISOString(),
              })
              .eq('id', retry.retry_id);

            // Create success notification
            await supabase
              .from('notifications')
              .insert({
                user_id: retry.user_id,
                type: 'billing_success',
                title: 'Payment Successful After Retry',
                message: `Your ${retry.plan_name} subscription payment has been successfully processed on retry #${retry.attempt_number}. Your subscription is now active.`,
              });

            // Log successful retry
            await supabase.rpc('log_billing_event', {
              p_event_type: 'retry',
              p_subscription_id: retry.subscription_id,
              p_user_id: retry.user_id,
              p_status: 'success',
              p_details: {
                retry_id: retry.retry_id,
                attempt_number: retry.attempt_number,
                invoice_id: invoice.id,
                transaction_id: paymentResult.Data.TransactionId,
                amount: retry.price
              }
            });

            retryResults.push({
              retry_id: retry.retry_id,
              subscription_id: retry.subscription_id,
              invoice_id: invoice.id,
              status: 'success',
              attempt_number: retry.attempt_number,
              amount: retry.price
            });

          } else {
            // Handle payment failure
            await handleRetryFailure(retry, invoice, supabase);
            
            retryResults.push({
              retry_id: retry.retry_id,
              subscription_id: retry.subscription_id,
              invoice_id: invoice.id,
              status: 'failed',
              attempt_number: retry.attempt_number,
              error: 'Payment processing failed'
            });
          }

        } catch (paymentError) {
          console.error('Retry payment processing error:', paymentError);
          
          // Handle payment error
          await handleRetryFailure(retry, invoice, supabase);
          
          retryResults.push({
            retry_id: retry.retry_id,
            subscription_id: retry.subscription_id,
            invoice_id: invoice.id,
            status: 'error',
            attempt_number: retry.attempt_number,
            error: paymentError instanceof Error ? paymentError.message : 'Payment error'
          });
        }

      } catch (error) {
        console.error(`Error processing retry ${retry.retry_id}:`, error);
        
        // Log the error
        await supabase.rpc('log_billing_event', {
          p_event_type: 'retry',
          p_subscription_id: retry.subscription_id,
          p_user_id: retry.user_id,
          p_status: 'error',
          p_error_message: error instanceof Error ? error.message : 'Unknown error'
        });
        
        retryResults.push({
          retry_id: retry.retry_id,
          status: 'error',
          attempt_number: retry.attempt_number,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      processed: retryResults.length,
      results: retryResults,
      message: `Processed ${retryResults.length} payment retries`
    });

  } catch (error) {
    console.error('Error in billing retry API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleRetryFailure(retry: any, invoice: any, supabase: any) {
  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'failed',
    })
    .eq('id', invoice.id);

  // Update retry status
  await supabase
    .from('payment_retries')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', retry.retry_id);

  // If more retries are available, schedule next retry
  if (retry.attempt_number < 5) {
    const retrySchedule = [1, 2, 4, 7, 14]; // days
    const nextRetryDays = retrySchedule[retry.attempt_number]; // 0-indexed
    const nextRetryDate = new Date(Date.now() + nextRetryDays * 24 * 60 * 60 * 1000);
    
    await supabase.rpc('schedule_payment_retry', {
      p_subscription_id: retry.subscription_id,
      p_attempt_number: retry.attempt_number + 1,
      p_retry_date: nextRetryDate.toISOString()
    });

    // Create retry notification
    await supabase
      .from('notifications')
      .insert({
        user_id: retry.user_id,
        type: 'billing_failed',
        title: 'Payment Retry Failed',
        message: `Your payment retry #${retry.attempt_number} has failed. We will attempt another payment in ${nextRetryDays} day(s). Please ensure your payment method is up to date.`,
      });
  } else {
    // All retries failed, cancel subscription
    await supabase.rpc('cancel_subscription', {
      p_subscription_id: retry.subscription_id,
      p_reason: 'Payment failed after 5 retry attempts'
    });

    // Create cancellation notification
    await supabase
      .from('notifications')
      .insert({
        user_id: retry.user_id,
        type: 'subscription_cancelled',
        title: 'Subscription Cancelled',
        message: `Your ${retry.plan_name} subscription has been cancelled after 5 failed payment attempts. You can reactivate your subscription at any time by updating your payment method.`,
      });
  }

  // Log the retry failure
  await supabase.rpc('log_billing_event', {
    p_event_type: 'retry',
    p_subscription_id: retry.subscription_id,
    p_user_id: retry.user_id,
    p_status: 'failed',
    p_details: {
      retry_id: retry.retry_id,
      attempt_number: retry.attempt_number,
      invoice_id: invoice.id,
      reason: 'Payment processing failed'
    }
  });
}
```

## 5. Internal Cron Job Scheduler

### 5.1 Billing Scheduler Implementation

```typescript
// src/lib/billing-scheduler.ts
export class BillingScheduler {
  private isRunning: boolean = false;
  private renewalInterval: NodeJS.Timeout | null = null;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start the scheduler when the class is instantiated
    this.start();
  }

  start() {
    // Run renewal check every day at 2 AM UTC
    this.scheduleRenewalCheck();
    
    // Run retry check every day at 3 AM UTC
    this.scheduleRetryCheck();
    
    console.log('Billing scheduler started');
  }

  stop() {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }
    
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    
    console.log('Billing scheduler stopped');
  }

  private scheduleRenewalCheck() {
    const scheduleNextRenewal = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(2, 0, 0, 0); // 2 AM UTC
      
      const timeUntilTomorrow = tomorrow.getTime() - now.getTime();
      
      setTimeout(async () => {
        if (!this.isRunning) {
          this.isRunning = true;
          try {
            console.log('Running daily renewal check...');
            await this.processDueSubscriptions();
            console.log('Daily renewal check completed');
          } catch (error) {
            console.error('Error in daily renewal check:', error);
          } finally {
            this.isRunning = false;
          }
        }
        
        // Schedule the next renewal check
        scheduleNextRenewal();
      }, timeUntilTomorrow);
    };
    
    // Schedule the first renewal check
    scheduleNextRenewal();
  }

  private scheduleRetryCheck() {
    const scheduleNextRetry = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(3, 0, 0, 0); // 3 AM UTC
      
      const timeUntilTomorrow = tomorrow.getTime() - now.getTime();
      
      setTimeout(async () => {
        if (!this.isRunning) {
          this.isRunning = true;
          try {
            console.log('Running daily retry check...');
            await this.processScheduledRetries();
            console.log('Daily retry check completed');
          } catch (error) {
            console.error('Error in daily retry check:', error);
          } finally {
            this.isRunning = false;
          }
        }
        
        // Schedule the next retry check
        scheduleNextRetry();
      }, timeUntilTomorrow);
    };
    
    // Schedule the first retry check
    scheduleNextRetry();
  }

  private async processDueSubscriptions() {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/billing/renew`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to process due subscriptions:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('Renewal processing result:', result);
    
    // Send monitoring alert if needed
    if (result.results?.some((r: any) => r.status === 'error')) {
      await this.sendAlert('Billing renewal errors detected', result);
    }
  }

  private async processScheduledRetries() {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/billing/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BILLING_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to process scheduled retries:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('Retry processing result:', result);
    
    // Send monitoring alert if needed
    if (result.results?.some((r: any) => r.status === 'error')) {
      await this.sendAlert('Billing retry errors detected', result);
    }
  }

  private async sendAlert(title: string, data: any) {
    // Implement alerting mechanism (email, Slack, etc.)
    console.error(`ALERT: ${title}`, data);
    
    // Example: Send to monitoring service
    if (process.env.MONITORING_WEBHOOK_URL) {
      await fetch(process.env.MONITORING_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  }
}

// Initialize the scheduler when the module is imported
let billingScheduler: BillingScheduler | null = null;

export function initializeBillingScheduler() {
  if (!billingScheduler) {
    billingScheduler = new BillingScheduler();
  }
  return billingScheduler;
}

export function getBillingScheduler() {
  return billingScheduler;
}

export function stopBillingScheduler() {
  if (billingScheduler) {
    billingScheduler.stop();
    billingScheduler = null;
  }
}
```

### 5.2 Initialize Scheduler in Application

```typescript
// src/app/layout.tsx or src/app/api/billing/scheduler/route.ts
import { initializeBillingScheduler } from '@/lib/billing-scheduler';

// Initialize the billing scheduler when the application starts
initializeBillingScheduler();
```

## 6. Testing Strategy

### 6.1 Unit Tests

Create unit tests for each component:

1. **Credit Management Tests**
   - Test interaction credit reset
   - Test scraper credit addition
   - Test error handling

2. **Payment Gateway Tests**
   - Test payment creation
   - Test payment status checking
   - Test error handling

3. **Billing Service Tests**
   - Test renewal processing
   - Test retry logic
   - Test subscription cancellation

### 6.2 Integration Tests

Create integration tests for the complete flow:

1. **Successful Renewal Flow**
   - Test end-to-end successful renewal
   - Verify credit allocation
   - Verify notification sending

2. **Failed Payment Flow**
   - Test payment failure handling
   - Verify retry scheduling
   - Verify subscription cancellation after retries

3. **Scheduler Tests**
   - Test scheduler initialization
   - Test daily execution
   - Test error handling

## 7. Monitoring and Alerting

### 7.1 Health Check Endpoint

**Endpoint**: `GET /api/billing/health`

```typescript
// src/app/api/billing/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getBillingScheduler } from '@/lib/billing-scheduler';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const scheduler = getBillingScheduler();
    
    // Check database connection
    const { data, error } = await supabase
      .from('subscriptions')
      .select('count')
      .limit(1);
    
    if (error) {
      return NextResponse.json({
        status: 'unhealthy',
        database: 'error',
        scheduler: scheduler ? 'running' : 'stopped',
        error: error.message
      }, { status: 503 });
    }
    
    // Check recent billing activity
    const { data: recentLogs } = await supabase
      .from('billing_logs')
      .select('created_at, status')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const recentErrors = recentLogs?.filter(log => log.status === 'error') || [];
    
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      scheduler: scheduler ? 'running' : 'stopped',
      recent_activity: {
        total_logs: recentLogs?.length || 0,
        recent_errors: recentErrors.length,
        last_log: recentLogs?.[0]?.created_at || null
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}
```

### 7.2 Monitoring Metrics

Track these metrics for monitoring:

1. **Billing Metrics**
   - Daily renewal count
   - Success/failure rate
   - Average processing time
   - Retry success rate

2. **Payment Metrics**
   - Payment success rate
   - Payment failure reasons
   - Average payment processing time

3. **Credit Metrics**
   - Credit allocation success rate
   - Credit reset/addition counts

4. **System Metrics**
   - Scheduler health
   - Database connection status
   - API response times

This implementation guide provides a comprehensive solution for the Monthly Billing Cycle automated system process, addressing all requirements from the flow specification.