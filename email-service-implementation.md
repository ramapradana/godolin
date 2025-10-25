# Email Service Implementation Guide (Resend Integration)

## Step 1: Install Dependencies

```bash
npm install resend react-email @react-email/components
```

## Step 2: Environment Configuration

Add to your `.env.local` file:
```env
RESEND_API_KEY=re_your_api_key_here
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME="AI Marketing Platform"
APP_URL=http://localhost:3000
```

## Step 3: Create Email Service Library

File: `src/lib/email-service.ts`
```typescript
import { Resend } from 'resend';
import { WelcomeEmail } from '@/emails/welcome-email';
import { VerifyEmail } from '@/emails/verify-email';
import { SubscriptionCreatedEmail } from '@/emails/subscription-created-email';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template: React.ReactElement;
  from?: string;
  replyTo?: string;
}

export class EmailService {
  private static fromEmail = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
  private static fromName = process.env.FROM_NAME || 'AI Marketing Platform';

  static async sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
      const { data, error } = await resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        react: options.template,
        replyTo: options.replyTo,
      });

      if (error) {
        console.error('Email service error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error('Unexpected email service error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async sendWelcomeEmail(userEmail: string, userName?: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendEmail({
      to: userEmail,
      subject: 'Welcome to AI Marketing Platform!',
      template: WelcomeEmail({ userName, userEmail }),
    });

    // Log email delivery
    await this.logEmailDelivery(userEmail, 'welcome', result.success, result.error);
    
    return { success: result.success, error: result.error };
  }

  static async sendEmailVerification(userEmail: string, verificationToken: string): Promise<{ success: boolean; error?: string }> {
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    
    const result = await this.sendEmail({
      to: userEmail,
      subject: 'Verify your email address',
      template: VerifyEmail({ verificationUrl }),
    });

    await this.logEmailDelivery(userEmail, 'email_verification', result.success, result.error);
    
    return { success: result.success, error: result.error };
  }

  static async sendSubscriptionCreatedEmail(
    userEmail: string, 
    planName: string, 
    userName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendEmail({
      to: userEmail,
      subject: `Your ${planName} subscription is active!`,
      template: SubscriptionCreatedEmail({ userName, planName, userEmail }),
    });

    await this.logEmailDelivery(userEmail, 'subscription_created', result.success, result.error);
    
    return { success: result.success, error: result.error };
  }

  private static async logEmailDelivery(
    userEmail: string, 
    templateName: string, 
    success: boolean, 
    error?: string
  ): Promise<void> {
    try {
      const supabase = await createSupabaseServerClient();
      
      await supabase
        .from('email_logs')
        .insert({
          user_email: userEmail,
          template_name: templateName,
          status: success ? 'sent' : 'failed',
          error_message: error,
          sent_at: success ? new Date().toISOString() : null,
        });
    } catch (logError) {
      console.error('Failed to log email delivery:', logError);
    }
  }
}
```

## Step 4: Create Email Templates

File: `src/emails/welcome-email.tsx`
```tsx
import { Html, Head, Body, Container, Text, Button, Section } from '@react-email/components';

interface WelcomeEmailProps {
  userName?: string;
  userEmail: string;
}

export function WelcomeEmail({ userName, userEmail }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>🚀 AI Marketing Platform</Text>
          </Section>
          
          <Section style={content}>
            <Text style={heading}>
              Welcome{userName ? `, ${userName}` : ''}! 🎉
            </Text>
            
            <Text style={paragraph}>
              Thank you for signing up for AI Marketing Platform! Your trial account has been created 
              and you're ready to start generating high-quality leads.
            </Text>
            
            <Text style={paragraph}>
              Your trial includes:
            </Text>
            
            <ul style={list}>
              <li>100 Scraper Credits</li>
              <li>150 Interaction Credits</li>
              <li>Access to all basic features</li>
              <li>14 days of full access</li>
            </ul>
            
            <Text style={paragraph}>
              To get started, complete your profile and explore our powerful lead generation tools.
            </Text>
            
            <Button style={button} href={`${process.env.APP_URL}/onboarding`}>
              Get Started Now
            </Button>
            
            <Text style={paragraph}>
              If you have any questions, reply to this email or check out our help center.
            </Text>
          </Section>
          
          <Section style={footer}>
            <Text style={footerText}>
              Best regards,<br />
              The AI Marketing Platform Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px',
  maxWidth: '600px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
};

const header = {
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '20px',
  marginBottom: '30px',
  textAlign: 'center' as const,
};

const logo = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#3b82f6',
  margin: '0',
};

const content = {
  marginBottom: '30px',
};

const heading = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#1f2937',
  marginBottom: '20px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#4b5563',
  marginBottom: '16px',
};

const list = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#4b5563',
  marginBottom: '20px',
  paddingLeft: '20px',
};

const button = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: 'bold',
  marginBottom: '20px',
};

const footer = {
  borderTop: '1px solid #e5e7eb',
  paddingTop: '20px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};
```

File: `src/emails/verify-email.tsx`
```tsx
import { Html, Head, Body, Container, Text, Button, Section } from '@react-email/components';

interface VerifyEmailProps {
  verificationUrl: string;
}

export function VerifyEmail({ verificationUrl }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>🚀 AI Marketing Platform</Text>
          </Section>
          
          <Section style={content}>
            <Text style={heading}>
              Verify your email address
            </Text>
            
            <Text style={paragraph}>
              Thanks for signing up! To complete your registration and start using AI Marketing Platform, 
              please verify your email address by clicking the button below.
            </Text>
            
            <Text style={paragraph}>
              This verification link will expire in 24 hours.
            </Text>
            
            <Button style={button} href={verificationUrl}>
              Verify Email Address
            </Button>
            
            <Text style={paragraph}>
              If you didn't create an account, you can safely ignore this email.
            </Text>
            
            <Text style={smallText}>
              If the button above doesn't work, copy and paste this link into your browser:<br />
              <Text style={link}>{verificationUrl}</Text>
            </Text>
          </Section>
          
          <Section style={footer}>
            <Text style={footerText}>
              Best regards,<br />
              The AI Marketing Platform Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px',
  maxWidth: '600px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
};

const header = {
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '20px',
  marginBottom: '30px',
  textAlign: 'center' as const,
};

const logo = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#3b82f6',
  margin: '0',
};

const content = {
  marginBottom: '30px',
};

const heading = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#1f2937',
  marginBottom: '20px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#4b5563',
  marginBottom: '16px',
};

const button = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: 'bold',
  marginBottom: '20px',
};

const smallText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#6b7280',
  marginBottom: '16px',
};

const link = {
  fontSize: '12px',
  color: '#3b82f6',
  wordBreak: 'break-all' as const,
};

const footer = {
  borderTop: '1px solid #e5e7eb',
  paddingTop: '20px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0',
};
```

## Step 5: Update Database Schema

File: `supabase/migrations/003_email_tracking.sql`
```sql
-- Email tracking table
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message TEXT,
  message_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add email_verified column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_user_email ON public.email_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON public.email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON public.email_verification_tokens(user_id);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_logs (admin only)
CREATE POLICY "Only admins can read email logs" ON public.email_logs
  FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Only service role can insert email logs" ON public.email_logs
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for email_verification_tokens
CREATE POLICY "Users can read own verification tokens" ON public.email_verification_tokens
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Service role can manage verification tokens" ON public.email_verification_tokens
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'sub' = user_id);
```

## Step 6: Create Email API Endpoints

File: `src/app/api/emails/send/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/lib/email-service';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { template, to, data } = body;

    if (!template || !to) {
      return NextResponse.json({ 
        error: 'Template and recipient are required' 
      }, { status: 400 });
    }

    let result;
    
    switch (template) {
      case 'welcome':
        result = await EmailService.sendWelcomeEmail(to, data?.userName);
        break;
      case 'verify_email':
        result = await EmailService.sendEmailVerification(to, data?.verificationToken);
        break;
      case 'subscription_created':
        result = await EmailService.sendSubscriptionCreatedEmail(
          to, 
          data?.planName, 
          data?.userName
        );
        break;
      default:
        return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
    }

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in email send API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Step 7: Update User Creation Flow

Update `src/app/api/subscriptions/create-trial/route.ts` to send welcome email:

```typescript
// Add this import at the top
import { EmailService } from '@/lib/email-service';

// Add this after the subscription creation (around line 86)
try {
  // Send welcome email
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase
    .from('users')
    .select('email, name')
    .eq('clerk_id', userId)
    .single();

  if (userData?.email) {
    await EmailService.sendWelcomeEmail(userData.email, userData.name);
  }
} catch (emailError) {
  console.error('Error sending welcome email:', emailError);
  // Don't fail the subscription creation if email fails
}
```

## Step 8: Test the Implementation

1. Create a test script to verify email sending:
```typescript
// src/scripts/test-email.ts
import { EmailService } from '@/lib/email-service';

async function testEmail() {
  const result = await EmailService.sendWelcomeEmail(
    'test@example.com',
    'Test User'
  );
  console.log('Email result:', result);
}

testEmail().catch(console.error);
```

2. Run the test:
```bash
npx tsx src/scripts/test-email.ts
```

## Next Steps

After implementing the email service, you can proceed with:

1. Creating the email verification flow
2. Building the profile completion UI
3. Implementing the onboarding progress tracking
4. Adding the plan selection interface

This email service foundation will support all the email communications needed for a comprehensive user onboarding experience.