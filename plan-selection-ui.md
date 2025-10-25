# Plan Selection UI Implementation

## Overview
This guide implements an interactive plan selection interface that helps new users choose the right subscription plan for their needs. The UI includes plan comparisons, feature highlights, and a seamless upgrade flow.

## Step 1: Create Plan Selection API

File: `src/app/api/onboarding/select-plan/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

const selectPlanSchema = z.object({
  planId: z.string().uuid(),
  skipBilling: z.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get available plans
    const { data: plans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (plansError) {
      console.error('Error fetching plans:', plansError);
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
    }

    // Get user's current subscription
    const { data: currentSubscription, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          name,
          price,
          scraper_credits,
          interaction_credits,
          features
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error('Error fetching current subscription:', subError);
    }

    // Get user profile for personalization
    const { data: profile } = await supabase
      .from('users')
      .select('company_size, industry, goals, experience_level')
      .eq('clerk_id', userId)
      .single();

    // Recommend plan based on user profile
    const recommendedPlan = getRecommendedPlan(plans || [], profile);

    return NextResponse.json({
      plans,
      currentSubscription: currentSubscription ? {
        ...currentSubscription,
        plan: currentSubscription.subscription_plans,
      } : null,
      recommendedPlan,
      userProfile: profile,
    });
  } catch (error) {
    console.error('Error in plan selection API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planId, skipBilling } = selectPlanSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    
    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Check if user already has an active subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['trial', 'active'])
      .single();

    if (existingSub && existingSub.plan_id === planId) {
      return NextResponse.json({ 
        error: 'You already have this subscription' 
      }, { status: 400 });
    }

    // For free plans, create subscription immediately
    if (plan.price === 0) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: plan.id,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .select()
        .single();

      if (subError) {
        console.error('Error creating subscription:', subError);
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
      }

      // Allocate credits
      await allocateCredits(userId, plan.scraper_credits, plan.interaction_credits);

      // Update onboarding progress
      await updateOnboardingProgress(userId, 'plan_selection');

      return NextResponse.json({
        subscription,
        plan,
        requiresBilling: false,
        message: 'Subscription created successfully',
      });
    }

    // For paid plans, create pending subscription and redirect to billing
    if (!skipBilling) {
      const { data: pendingSubscription, error: pendingError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: plan.id,
          status: 'past_due', // Will be updated after payment
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (pendingError) {
        console.error('Error creating pending subscription:', pendingError);
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
      }

      return NextResponse.json({
        subscription: pendingSubscription,
        plan,
        requiresBilling: true,
        billingUrl: `/billing?subscription_id=${pendingSubscription.id}&plan_id=${planId}`,
        message: 'Please complete billing information',
      });
    }

    return NextResponse.json({ error: 'Billing information required' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: error.errors 
      }, { status: 400 });
    }

    console.error('Error in plan selection POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getRecommendedPlan(plans: any[], profile: any) {
  if (!profile || !plans.length) return plans[0]?.id;

  const { company_size, goals = [], experience_level } = profile;
  
  // Simple recommendation logic
  if (company_size === '500+' || goals.includes('Expand to new markets')) {
    const enterprisePlan = plans.find(p => p.name.toLowerCase() === 'enterprise');
    return enterprisePlan?.id || plans[plans.length - 1]?.id;
  }
  
  if (company_size === '51-200' || company_size === '201-500' || experience_level === 'advanced') {
    const proPlan = plans.find(p => p.name.toLowerCase() === 'pro');
    return proPlan?.id || plans[plans.length - 2]?.id;
  }
  
  if (company_size === '11-50' || goals.includes('Generate more leads')) {
    const basicPlan = plans.find(p => p.name.toLowerCase() === 'basic');
    return basicPlan?.id || plans[1]?.id;
  }
  
  // Default to trial or first plan
  const trialPlan = plans.find(p => p.name.toLowerCase() === 'trial');
  return trialPlan?.id || plans[0]?.id;
}

async function allocateCredits(userId: string, scraperCredits: number, interactionCredits: number) {
  const supabase = await createSupabaseServerClient();

  // Add scraper credits
  if (scraperCredits > 0) {
    await supabase.rpc('add_credit_transaction', {
      p_user_id: userId,
      p_credit_type: 'scraper',
      p_amount: scraperCredits,
      p_source: 'monthly_allocation',
      p_description: `Monthly allocation - ${scraperCredits} scraper credits`
    });
  }

  // Add interaction credits
  if (interactionCredits > 0) {
    await supabase.rpc('add_credit_transaction', {
      p_user_id: userId,
      p_credit_type: 'interaction',
      p_amount: interactionCredits,
      p_source: 'monthly_allocation',
      p_description: `Monthly allocation - ${interactionCredits} interaction credits`
    });
  }
}

async function updateOnboardingProgress(userId: string, step: string) {
  const supabase = await createSupabaseServerClient();
  
  const { data: existingProgress } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', userId)
    .single();

  const completedSteps = existingProgress?.completed_steps || [];
  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  const isCompleted = completedSteps.length >= 4; // Total onboarding steps

  await supabase
    .from('onboarding_progress')
    .upsert({
      user_id: userId,
      current_step: step,
      completed_steps: completedSteps,
      is_completed: isCompleted,
      last_updated_at: new Date().toISOString(),
    });
}
```

## Step 2: Create Plan Selection Page

File: `src/app/onboarding/plans/page.tsx`
```tsx
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  Star, 
  Zap, 
  Users, 
  MessageSquare, 
  TrendingUp,
  ArrowRight,
  Crown,
  Building,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  price: number;
  scraper_credits: number;
  interaction_credits: number;
  features: any;
  is_active: boolean;
}

interface PlanSelectionData {
  plans: Plan[];
  currentSubscription: any;
  recommendedPlan: string;
  userProfile: any;
}

const featureIcons = {
  lead_export: Users,
  whatsapp_integration: MessageSquare,
  api_access: Zap,
  advanced_filters: TrendingUp,
  priority_support: Star,
  '24/7_support': Star,
  custom_integrations: Building,
  dedicated_account_manager: Crown,
};

const planColors = {
  Trial: 'border-gray-200',
  Basic: 'border-blue-500',
  Pro: 'border-purple-500',
  Enterprise: 'border-amber-500',
};

const planBadges = {
  Trial: { text: 'Free', variant: 'secondary' as const },
  Basic: { text: 'Popular', variant: 'default' as const },
  Pro: { text: 'Best Value', variant: 'default' as const },
  Enterprise: { text: 'Premium', variant: 'default' as const },
};

export default function PlanSelectionPage() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<PlanSelectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }

    fetchPlans();
  }, [isSignedIn, userId]);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/onboarding/select-plan');
      if (response.ok) {
        const planData = await response.json();
        setData(planData);
        setSelectedPlan(planData.recommendedPlan);
      }
    } catch (error) {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelect = async (planId: string) => {
    setProcessing(true);
    try {
      const response = await fetch('/api/onboarding/select-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.requiresBilling) {
          toast.success('Plan selected! Please complete billing information.');
          router.push(result.billingUrl);
        } else {
          toast.success('Subscription activated successfully!');
          router.push('/dashboard');
        }
      } else {
        toast.error(result.error || 'Failed to select plan');
      }
    } catch (error) {
      toast.error('An error occurred while selecting your plan');
    } finally {
      setProcessing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat('en-US').format(credits);
  };

  const renderFeature = (featureKey: string, featureValue: any) => {
    const Icon = featureIcons[featureKey as keyof typeof featureIcons] || CheckCircle;
    
    return (
      <div key={featureKey} className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-green-500" />
        <span className="text-sm capitalize">
          {featureKey.replace(/_/g, ' ')}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading plans...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-4">Failed to load plans</p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const { plans, recommendedPlan, userProfile } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Select the perfect plan for your business needs. Upgrade or downgrade at any time.
          </p>
          
          {userProfile && (
            <div className="mt-6">
              <Badge variant="outline" className="text-sm">
                Recommended plan based on your profile
              </Badge>
            </div>
          )}
        </div>

        {/* Plan Comparison */}
        <Tabs defaultValue="monthly" className="max-w-6xl mx-auto mb-12">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="monthly">Monthly Billing</TabsTrigger>
            <TabsTrigger value="annual">Annual Billing (Save 20%)</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {plans.map((plan) => {
                const isRecommended = plan.id === recommendedPlan;
                const badge = planBadges[plan.name as keyof typeof planBadges];
                const borderColor = planColors[plan.name as keyof typeof planColors];
                
                return (
                  <Card 
                    key={plan.id} 
                    className={`relative ${borderColor} ${
                      isRecommended ? 'ring-2 ring-blue-500 shadow-lg' : ''
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-blue-500 text-white">
                          Recommended
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-4">
                      <CardTitle className="text-xl flex items-center justify-center gap-2">
                        {plan.name === 'Enterprise' && <Crown className="w-5 h-5 text-amber-500" />}
                        {plan.name === 'Pro' && <Rocket className="w-5 h-5 text-purple-500" />}
                        {plan.name}
                      </CardTitle>
                      <div className="text-3xl font-bold">
                        {plan.price === 0 ? 'Free' : formatPrice(plan.price)}
                      </div>
                      <CardDescription>
                        {plan.price === 0 ? 'Forever free' : 'Per month'}
                      </CardDescription>
                      {badge && (
                        <Badge variant={badge.variant} className="mt-2">
                          {badge.text}
                        </Badge>
                      )}
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                      {/* Credits */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Scraper Credits</span>
                          <span className="font-bold">{formatCredits(plan.scraper_credits)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Interaction Credits</span>
                          <span className="font-bold">{formatCredits(plan.interaction_credits)}</span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-3">
                        {plan.features && Object.entries(plan.features).map(([key, value]) => {
                          if (value === true) {
                            return renderFeature(key, value);
                          }
                          return null;
                        })}
                      </div>

                      {/* CTA Button */}
                      <Button 
                        className={`w-full ${
                          isRecommended ? 'bg-blue-600 hover:bg-blue-700' : ''
                        }`}
                        onClick={() => handlePlanSelect(plan.id)}
                        disabled={processing}
                      >
                        {processing ? 'Processing...' : 
                         plan.price === 0 ? 'Start Free' : `Select ${plan.name}`}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="annual" className="mt-8">
            <div className="text-center mb-8">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Save 20% with annual billing
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {plans.map((plan) => {
                if (plan.price === 0) return null; // Skip free plan for annual
                
                const annualPrice = plan.price * 12 * 0.8; // 20% discount
                const isRecommended = plan.id === recommendedPlan;
                
                return (
                  <Card 
                    key={plan.id} 
                    className={`relative ${planColors[plan.name as keyof typeof planColors]} ${
                      isRecommended ? 'ring-2 ring-blue-500 shadow-lg' : ''
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-blue-500 text-white">
                          Recommended
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-4">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div>
                        <div className="text-3xl font-bold">{formatPrice(annualPrice)}</div>
                        <div className="text-sm text-gray-500 line-through">
                          {formatPrice(plan.price * 12)}
                        </div>
                      </div>
                      <CardDescription>Billed annually</CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                      {/* Credits */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Scraper Credits</span>
                          <span className="font-bold">{formatCredits(plan.scraper_credits * 12)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Interaction Credits</span>
                          <span className="font-bold">{formatCredits(plan.interaction_credits * 12)}</span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-3">
                        {plan.features && Object.entries(plan.features).map(([key, value]) => {
                          if (value === true) {
                            return renderFeature(key, value);
                          }
                          return null;
                        })}
                      </div>

                      {/* CTA Button */}
                      <Button 
                        className={`w-full ${
                          isRecommended ? 'bg-blue-600 hover:bg-blue-700' : ''
                        }`}
                        onClick={() => handlePlanSelect(plan.id)}
                        disabled={processing}
                      >
                        {processing ? 'Processing...' : `Select ${plan.name}`}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Feature Comparison Table */}
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Feature Comparison</CardTitle>
              <CardDescription>
                Detailed comparison of all available plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Feature</th>
                      {plans.map((plan) => (
                        <th key={plan.id} className="text-center p-4">{plan.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-4 font-medium">Price</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center p-4">
                          {plan.price === 0 ? 'Free' : formatPrice(plan.price)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">Scraper Credits</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center p-4">
                          {formatCredits(plan.scraper_credits)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">Interaction Credits</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center p-4">
                          {formatCredits(plan.interaction_credits)}
                        </td>
                      ))}
                    </tr>
                    {['lead_export', 'whatsapp_integration', 'api_access', 'advanced_filters', 'priority_support'].map((feature) => (
                      <tr key={feature} className="border-b">
                        <td className="p-4 font-medium capitalize">
                          {feature.replace(/_/g, ' ')}
                        </td>
                        {plans.map((plan) => (
                          <td key={plan.id} className="text-center p-4">
                            {plan.features?.[feature] ? (
                              <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Skip Option */}
        <div className="text-center mt-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard')}
            className="text-gray-500 hover:text-gray-700"
          >
            Skip for now, I'll decide later
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Step 3: Create Plan Comparison Component

File: `src/components/plan-comparison.tsx`
```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, X, Star } from 'lucide-react';
import { Plan } from '@/types/subscription';

interface PlanComparisonProps {
  plans: Plan[];
  recommendedPlan?: string;
  onSelectPlan: (planId: string) => void;
  processing?: boolean;
}

export function PlanComparison({ 
  plans, 
  recommendedPlan, 
  onSelectPlan, 
  processing = false 
}: PlanComparisonProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat('en-US').format(credits);
  };

  const getPlanColor = (planName: string) => {
    const colors = {
      Trial: 'border-gray-200',
      Basic: 'border-blue-500',
      Pro: 'border-purple-500',
      Enterprise: 'border-amber-500',
    };
    return colors[planName as keyof typeof colors] || 'border-gray-200';
  };

  const getPlanBadge = (planName: string) => {
    const badges = {
      Trial: { text: 'Free', variant: 'secondary' as const },
      Basic: { text: 'Popular', variant: 'default' as const },
      Pro: { text: 'Best Value', variant: 'default' as const },
      Enterprise: { text: 'Premium', variant: 'default' as const },
    };
    return badges[planName as keyof typeof badges] || { text: '', variant: 'secondary' as const };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      {plans.map((plan) => {
        const isRecommended = plan.id === recommendedPlan;
        const badge = getPlanBadge(plan.name);
        const borderColor = getPlanColor(plan.name);
        
        return (
          <Card 
            key={plan.id} 
            className={`relative ${borderColor} ${
              isRecommended ? 'ring-2 ring-blue-500 shadow-lg' : ''
            }`}
          >
            {isRecommended && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-500 text-white">
                  Recommended
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <div className="text-3xl font-bold">
                {plan.price === 0 ? 'Free' : formatPrice(plan.price)}
              </div>
              <CardDescription>
                {plan.price === 0 ? 'Forever free' : 'Per month'}
              </CardDescription>
              {badge.text && (
                <Badge variant={badge.variant} className="mt-2">
                  {badge.text}
                </Badge>
              )}
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Credits */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Scraper Credits</span>
                  <span className="font-bold">{formatCredits(plan.scraper_credits)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Interaction Credits</span>
                  <span className="font-bold">{formatCredits(plan.interaction_credits)}</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3">
                {plan.features && Object.entries(plan.features).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    {value === true ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <Button 
                className={`w-full ${
                  isRecommended ? 'bg-blue-600 hover:bg-blue-700' : ''
                }`}
                onClick={() => onSelectPlan(plan.id)}
                disabled={processing}
              >
                {processing ? 'Processing...' : 
                 plan.price === 0 ? 'Start Free' : `Select ${plan.name}`}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

## Step 4: Create Plan Selection Hook

File: `src/hooks/use-plan-selection.ts`
```typescript
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface Plan {
  id: string;
  name: string;
  price: number;
  scraper_credits: number;
  interaction_credits: number;
  features: any;
  is_active: boolean;
}

interface PlanSelectionState {
  plans: Plan[];
  currentSubscription: any;
  recommendedPlan: string;
  userProfile: any;
  loading: boolean;
  error: string | null;
}

export function usePlanSelection() {
  const { isSignedIn, userId } = useAuth();
  const [state, setState] = useState<PlanSelectionState>({
    plans: [],
    currentSubscription: null,
    recommendedPlan: '',
    userProfile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    fetchPlanData();
  }, [isSignedIn, userId]);

  const fetchPlanData = async () => {
    try {
      const response = await fetch('/api/onboarding/select-plan');
      if (!response.ok) {
        throw new Error('Failed to fetch plan data');
      }

      const data = await response.json();
      setState({
        plans: data.plans || [],
        currentSubscription: data.currentSubscription,
        recommendedPlan: data.recommendedPlan || '',
        userProfile: data.userProfile,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  };

  const selectPlan = async (planId: string) => {
    try {
      const response = await fetch('/api/onboarding/select-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        throw new Error('Failed to select plan');
      }

      return await response.json();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return {
    ...state,
    refetch: fetchPlanData,
    selectPlan,
  };
}
```

## Step 5: Add Plan Selection to Onboarding Flow

File: `src/app/onboarding/page.tsx`
```tsx
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  CreditCard, 
  Target, 
  CheckCircle,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useProfileCompletion } from '@/hooks/use-profile-completion';
import { usePlanSelection } from '@/hooks/use-plan-selection';
import { toast } from 'sonner';

export default function OnboardingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { isCompleted: profileCompleted } = useProfileCompletion();
  const { plans, recommendedPlan, loading: plansLoading, selectPlan } = usePlanSelection();
  const [currentStep, setCurrentStep] = useState(0);
  const [processing, setProcessing] = useState(false);

  const steps = [
    { title: 'Profile', icon: User, completed: profileCompleted },
    { title: 'Plan Selection', icon: CreditCard, completed: false },
    { title: 'Dashboard Tour', icon: Target, completed: false },
  ];

  useEffect(() => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }

    // Set current step based on completion status
    if (profileCompleted) {
      setCurrentStep(1);
    }
  }, [isSignedIn, profileCompleted]);

  const handlePlanSelect = async (planId: string) => {
    setProcessing(true);
    try {
      const result = await selectPlan(planId);
      
      if (result.requiresBilling) {
        router.push(result.billingUrl);
      } else {
        toast.success('Plan selected successfully!');
        setCurrentStep(2);
      }
    } catch (error) {
      toast.error('Failed to select plan');
    } finally {
      setProcessing(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getCompletionPercentage = () => {
    return Math.round(((currentStep + 1) / steps.length) * 100);
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading onboarding...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to AI Marketing Platform
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Let's get you set up in just a few steps
            </p>
            <div className="mt-4">
              <Badge variant="outline">
                {getCompletionPercentage()}% Complete
              </Badge>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <Progress value={getCompletionPercentage()} className="h-2" />
            <div className="flex justify-between mt-2">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    index <= currentStep
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {step.completed ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {steps.map((step, index) => (
                <span
                  key={index}
                  className={`text-xs ${
                    index <= currentStep
                      ? 'text-blue-600 font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  {step.title}
                </span>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <steps[currentStep].icon className="w-5 h-5" />
                {steps[currentStep].title}
              </CardTitle>
              <CardDescription>
                Step {currentStep + 1} of {steps.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === 0 && (
                <div className="text-center py-8">
                  <User className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">Complete Your Profile</h3>
                  <p className="text-gray-500 mb-4">
                    Help us personalize your experience by completing your profile
                  </p>
                  <Button onClick={() => router.push('/onboarding/profile')}>
                    Complete Profile
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <CreditCard className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">Choose Your Plan</h3>
                    <p className="text-gray-500">
                      Select the plan that best fits your needs
                    </p>
                  </div>
                  
                  {/* Plan selection will be rendered here */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {plans.map((plan) => {
                      const isRecommended = plan.id === recommendedPlan;
                      
                      return (
                        <Card 
                          key={plan.id} 
                          className={`cursor-pointer transition-all ${
                            isRecommended ? 'ring-2 ring-blue-500' : ''
                          }`}
                          onClick={() => handlePlanSelect(plan.id)}
                        >
                          <CardHeader className="text-center">
                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                            <div className="text-2xl font-bold">
                              {plan.price === 0 ? 'Free' : `IDR ${plan.price.toLocaleString()}`}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="text-sm">
                                <strong>{plan.scraper_credits.toLocaleString()}</strong> scraper credits
                              </div>
                              <div className="text-sm">
                                <strong>{plan.interaction_credits.toLocaleString()}</strong> interaction credits
                              </div>
                            </div>
                            <Button 
                              className="w-full mt-4" 
                              disabled={processing}
                              variant={isRecommended ? 'default' : 'outline'}
                            >
                              {processing ? 'Processing...' : 'Select'}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="text-center py-8">
                  <Target className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">Dashboard Tour</h3>
                  <p className="text-gray-500 mb-4">
                    Take a quick tour of your new dashboard
                  </p>
                  <Button onClick={() => router.push('/dashboard')}>
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {currentStep < steps.length - 1 && currentStep !== 1 && (
              <Button onClick={nextStep}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Skip Option */}
          <div className="text-center mt-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/dashboard')}
              className="text-gray-500 hover:text-gray-700"
            >
              Skip onboarding
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Testing the Implementation

1. **Test Plan Selection Flow**:
   - Navigate to `/onboarding/plans`
   - Verify all plans are displayed
   - Check recommended plan based on profile
   - Test plan selection for free and paid plans

2. **Test Billing Integration**:
   - Select a paid plan
   - Verify redirect to billing page
   - Check subscription creation

3. **Test Plan Comparison**:
   - Compare features across plans
   - Verify pricing display
   - Test annual vs monthly billing

4. **Test Recommendation Logic**:
   - Create profiles with different company sizes
   - Verify appropriate plan recommendations
   - Test goal-based recommendations

## Next Steps

After implementing plan selection UI, you can proceed with:

1. Creating the dashboard onboarding tour
2. Implementing email verification flow
3. Adding welcome email sequence
4. Creating analytics for onboarding funnel

This plan selection system provides users with a clear, interactive way to choose the right subscription plan for their needs.