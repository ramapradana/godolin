import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import {
  holdInteractionCredits,
  deductInteractionCredits,
  releaseInteractionCreditHold
} from '@/lib/interaction-credit-service';

export async function POST(request: NextRequest) {
  let holdId: string | null = null;
  
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { lead_id, message, phone_number } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    if (!lead_id && !phone_number) {
      return NextResponse.json({ error: 'Either lead_id or phone_number is required' }, { status: 400 });
    }

    // Generate a unique reference ID for this operation
    const messageReferenceId = `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Step 1: Place a credit hold before any operations
    try {
      holdId = await holdInteractionCredits(
        userId,
        1, // 1 credit per WhatsApp message
        messageReferenceId,
        30 // Hold expires in 30 minutes
      );
    } catch (holdError) {
      console.error('Error holding interaction credits:', holdError);
      
      // Check for insufficient credits error
      const errorMessage = holdError instanceof Error ? holdError.message : String(holdError);
      if (errorMessage.includes('Insufficient credits')) {
        const match = errorMessage.match(/Available: (\d+), Required: (\d+)/);
        if (match) {
          const availableCredits = parseInt(match[1]);
          const requiredCredits = parseInt(match[2]);
          
          return NextResponse.json({
            error: 'Insufficient interaction credits',
            code: 'INSUFFICIENT_CREDITS',
            available_credits: availableCredits,
            required_credits: requiredCredits
          }, { status: 402 });
        }
      }
      
      return NextResponse.json({
        error: 'Failed to hold interaction credits',
        code: 'CREDIT_HOLD_FAILED'
      }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();
    const requiredCredits = 1; // 1 credit per WhatsApp message

    // Get lead information if lead_id is provided
    let leadInfo = null;
    if (lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', lead_id)
        .single();

      if (leadError) {
        console.error('Error fetching lead:', leadError);
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      leadInfo = lead;
    }

    const targetPhone = phone_number || leadInfo?.phone;
    if (!targetPhone) {
      return NextResponse.json({ error: 'Phone number not found' }, { status: 400 });
    }

    // Create WhatsApp message record
    const { data: messageRecord, error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        user_id: userId,
        lead_id: lead_id || null,
        message_type: 'outgoing',
        content: message,
        status: 'pending',
        credits_used: requiredCredits,
        hold_id: holdId, // Store the hold ID for reference
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error creating WhatsApp message record:', messageError);
      
      // Release the credit hold since we can't proceed
      if (holdId) {
        try {
          await releaseInteractionCreditHold(holdId, 'Failed to create message record');
        } catch (releaseError) {
          console.error('Error releasing credit hold:', releaseError);
        }
      }
      
      return NextResponse.json({ error: 'Failed to create message record' }, { status: 500 });
    }

    // Simulate WhatsApp API call (in real implementation, this would call actual WhatsApp API)
    try {
      const whatsappResult = await sendWhatsAppMessage(targetPhone, message);
      
      // Step 5: Convert credit hold to deduction on success
      if (holdId) {
        try {
          await deductInteractionCredits(
            holdId,
            `WhatsApp message sent - ${messageReferenceId}`
          );
        } catch (deductError) {
          console.error('Error deducting interaction credits:', deductError);
          // Don't fail the request, but log for manual intervention
        }
      }
      
      // Update message record with success status
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'sent',
          whatsapp_message_id: whatsappResult.message_id,
          sent_at: new Date().toISOString(),
        })
        .eq('id', messageRecord.id);

      // Get updated credit balance
      let updatedBalance = 0;
      try {
        const { data: balance } = await supabase
          .rpc('get_credit_balance', {
            p_user_id: userId,
            p_credit_type: 'interaction'
          });
        updatedBalance = balance || 0;
      } catch (balanceError) {
        console.error('Error fetching updated balance:', balanceError);
      }

      return NextResponse.json({
        message_id: messageRecord.id,
        status: 'sent',
        whatsapp_message_id: whatsappResult.message_id,
        credits_used: requiredCredits,
        remaining_credits: updatedBalance,
        phone_number: targetPhone,
        hold_id: holdId
      });

    } catch (whatsappError) {
      console.error('Error sending WhatsApp message:', whatsappError);
      
      // Step 6: Release credit hold on failure
      if (holdId) {
        try {
          await releaseInteractionCreditHold(
            holdId,
            `WhatsApp API error: ${whatsappError instanceof Error ? whatsappError.message : 'Unknown error'}`
          );
        } catch (releaseError) {
          console.error('Error releasing credit hold:', releaseError);
        }
      }

      // Update message record as failed
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_message: whatsappError instanceof Error ? whatsappError.message : 'Unknown error',
        })
        .eq('id', messageRecord.id);

      return NextResponse.json({
        error: 'Failed to send WhatsApp message',
        message_id: messageRecord.id,
        credits_released: requiredCredits,
        hold_id: holdId
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in WhatsApp send API:', error);
    
    // Release any active credit hold on unexpected errors
    if (holdId) {
      try {
        await releaseInteractionCreditHold(holdId, 'Unexpected error in WhatsApp API');
      } catch (releaseError) {
        console.error('Error releasing credit hold:', releaseError);
      }
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Mock function to simulate WhatsApp API call
async function sendWhatsAppMessage(phone: string, message: string) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simulate random failure (10% chance)
  if (Math.random() < 0.1) {
    throw new Error('WhatsApp API temporarily unavailable');
  }
  
  return {
    message_id: `wa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'sent',
    phone: phone
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const lead_id = searchParams.get('lead_id');

    const supabase = await createSupabaseServerClient();
    
    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }
    
    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching WhatsApp messages:', messagesError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error in WhatsApp messages GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}