# User Profile Completion Flow Implementation

## Overview
This guide implements a multi-step profile completion flow that guides new users through setting up their profile, which is essential for personalizing their experience and improving lead generation results.

## Step 1: Create Profile Completion API

File: `src/app/api/onboarding/profile/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  company_name: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional(),
  role: z.string().optional(),
  goals: z.array(z.string()).optional(),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    // Get onboarding progress
    const { data: progress, error: progressError } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (progressError && progressError.code !== 'PGRST116') {
      console.error('Error fetching onboarding progress:', progressError);
    }

    // Calculate completion percentage
    const completionPercentage = calculateCompletionPercentage(profile, progress);

    return NextResponse.json({
      profile,
      progress,
      completionPercentage,
      isCompleted: completionPercentage === 100,
    });
  } catch (error) {
    console.error('Error in profile completion API:', error);
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
    const validatedData = profileSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    
    // Update user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .upsert({
        clerk_id: userId,
        ...validatedData,
        updated_at: new Date().toISOString(),
        profile_completed: true,
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // Update onboarding progress
    await updateOnboardingProgress(userId, 'profile_completion');

    return NextResponse.json({ 
      profile,
      message: 'Profile updated successfully' 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: error.errors 
      }, { status: 400 });
    }

    console.error('Error in profile completion POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateCompletionPercentage(profile: any, progress: any): number {
  let completed = 0;
  const total = 8; // Total number of profile fields

  if (profile?.name) completed++;
  if (profile?.phone) completed++;
  if (profile?.company_name) completed++;
  if (profile?.industry) completed++;
  if (profile?.company_size) completed++;
  if (profile?.role) completed++;
  if (profile?.goals && profile.goals.length > 0) completed++;
  if (profile?.experience_level) completed++;

  return Math.round((completed / total) * 100);
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

## Step 2: Create Profile Completion Page

File: `src/app/onboarding/profile/page.tsx`
```tsx
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Building, 
  Phone, 
  Briefcase, 
  Target, 
  TrendingUp,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  company_name: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional(),
  role: z.string().optional(),
  goals: z.array(z.string()).optional(),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 
  'Manufacturing', 'Real Estate', 'Consulting', 'Marketing', 'Other'
];

const companySizes = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '500+', label: '500+ employees' },
];

const commonGoals = [
  'Generate more leads',
  'Improve lead quality',
  'Save time on prospecting',
  'Expand to new markets',
  'Increase conversion rates',
  'Automate outreach',
];

const experienceLevels = [
  { value: 'beginner', label: 'New to lead generation' },
  { value: 'intermediate', label: 'Some experience' },
  { value: 'advanced', label: 'Experienced marketer' },
];

export default function ProfileCompletionPage() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
  });

  const selectedGoals = watch('goals') || [];

  const steps = [
    { title: 'Basic Info', icon: User },
    { title: 'Company Details', icon: Building },
    { title: 'Goals & Experience', icon: Target },
  ];

  useEffect(() => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }

    fetchExistingProfile();
  }, [isSignedIn, userId]);

  const fetchExistingProfile = async () => {
    try {
      const response = await fetch('/api/onboarding/profile');
      if (response.ok) {
        const data = await response.json();
        setCompletionPercentage(data.completionPercentage || 0);
        
        if (data.profile) {
          // Populate form with existing data
          Object.keys(data.profile).forEach(key => {
            if (key !== 'clerk_id' && key !== 'created_at' && key !== 'updated_at') {
              setValue(key as keyof ProfileFormData, data.profile[key]);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success('Profile completed successfully!');
        
        // Check if onboarding is complete
        const result = await response.json();
        if (result.isCompleted) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding/plans');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update profile');
      }
    } catch (error) {
      toast.error('An error occurred while updating your profile');
    } finally {
      setLoading(false);
    }
  };

  const handleGoalToggle = (goal: string) => {
    const currentGoals = selectedGoals || [];
    const newGoals = currentGoals.includes(goal)
      ? currentGoals.filter(g => g !== goal)
      : [...currentGoals, goal];
    setValue('goals', newGoals);
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="John Doe"
                className="mt-1"
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                {...register('phone')}
                placeholder="+1 (555) 123-4567"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="role">Your Role</Label>
              <Input
                id="role"
                {...register('role')}
                placeholder="Marketing Manager"
                className="mt-1"
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                {...register('company_name')}
                placeholder="Acme Corporation"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select onValueChange={(value) => setValue('industry', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="company_size">Company Size</Label>
              <Select onValueChange={(value) => setValue('company_size', value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  {companySizes.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label>What are your goals? (Select all that apply)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {commonGoals.map((goal) => (
                  <div key={goal} className="flex items-center space-x-2">
                    <Checkbox
                      id={goal}
                      checked={selectedGoals.includes(goal)}
                      onCheckedChange={() => handleGoalToggle(goal)}
                    />
                    <Label htmlFor={goal} className="text-sm font-normal">
                      {goal}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="experience_level">Experience Level</Label>
              <Select onValueChange={(value) => setValue('experience_level', value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select your experience level" />
                </SelectTrigger>
                <SelectContent>
                  {experienceLevels.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Complete Your Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Help us personalize your experience by telling us more about yourself
            </p>
            <div className="mt-4">
              <Badge variant="outline">
                {completionPercentage}% Complete
              </Badge>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <Progress value={completionPercentage} className="h-2" />
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
                  {index + 1}
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

          {/* Form */}
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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {renderStepContent()}

                {/* Navigation */}
                <div className="flex justify-between pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    disabled={currentStep === 0}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>

                  {currentStep < steps.length - 1 ? (
                    <Button type="button" onClick={nextStep}>
                      Next
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={loading || !isValid}>
                      {loading ? 'Saving...' : 'Complete Profile'}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Skip Option */}
          <div className="text-center mt-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/onboarding/plans')}
              className="text-gray-500 hover:text-gray-700"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Step 3: Update Database Schema

File: `supabase/migrations/004_profile_completion.sql`
```sql
-- Add profile completion columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_size TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS goals JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- Create onboarding progress table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  current_step TEXT NOT NULL DEFAULT 'profile_completion',
  completed_steps TEXT[] DEFAULT '{}',
  is_completed BOOLEAN DEFAULT false,
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON public.users(profile_completed);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_id ON public.onboarding_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_is_completed ON public.onboarding_progress(is_completed);

-- Enable RLS
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for onboarding_progress
CREATE POLICY "Users can read own onboarding progress" ON public.onboarding_progress
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update own onboarding progress" ON public.onboarding_progress
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Service role can manage onboarding progress" ON public.onboarding_progress
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'sub' = user_id);
```

## Step 4: Create Profile Completion Hook

File: `src/hooks/use-profile-completion.ts`
```typescript
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface ProfileData {
  id: string;
  clerk_id: string;
  email: string;
  name?: string;
  phone?: string;
  company_name?: string;
  industry?: string;
  company_size?: string;
  role?: string;
  goals?: string[];
  experience_level?: string;
  profile_completed?: boolean;
  created_at: string;
  updated_at: string;
}

interface OnboardingProgress {
  id: string;
  user_id: string;
  current_step: string;
  completed_steps: string[];
  is_completed: boolean;
  last_updated_at: string;
  created_at: string;
}

interface ProfileCompletionState {
  profile: ProfileData | null;
  progress: OnboardingProgress | null;
  completionPercentage: number;
  isCompleted: boolean;
  loading: boolean;
  error: string | null;
}

export function useProfileCompletion() {
  const { isSignedIn, userId } = useAuth();
  const [state, setState] = useState<ProfileCompletionState>({
    profile: null,
    progress: null,
    completionPercentage: 0,
    isCompleted: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    fetchProfileCompletion();
  }, [isSignedIn, userId]);

  const fetchProfileCompletion = async () => {
    try {
      const response = await fetch('/api/onboarding/profile');
      if (!response.ok) {
        throw new Error('Failed to fetch profile completion data');
      }

      const data = await response.json();
      setState({
        profile: data.profile,
        progress: data.progress,
        completionPercentage: data.completionPercentage,
        isCompleted: data.isCompleted,
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

  const updateProfile = async (profileData: Partial<ProfileData>) => {
    try {
      const response = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      await fetchProfileCompletion(); // Refresh data
      return await response.json();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return {
    ...state,
    refetch: fetchProfileCompletion,
    updateProfile,
  };
}
```

## Step 5: Update Dashboard to Check Profile Completion

File: `src/app/dashboard/page.tsx` (add this check at the beginning of the component):
```tsx
// Add this import
import { useProfileCompletion } from '@/hooks/use-profile-completion';
import { redirect } from 'next/navigation';

// Add this inside the Dashboard component
const { isCompleted: profileCompleted, loading: profileLoading } = useProfileCompletion();

// Add this check after the loading state
if (!profileLoading && !profileCompleted) {
  return redirect('/onboarding/profile');
}
```

## Step 6: Create Profile Completion Progress Indicator

File: `src/components/profile-progress-indicator.tsx`
```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Building, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface ProfileProgressIndicatorProps {
  completionPercentage: number;
  isCompleted: boolean;
}

export function ProfileProgressIndicator({ 
  completionPercentage, 
  isCompleted 
}: ProfileProgressIndicatorProps) {
  if (isCompleted) {
    return null;
  }

  const steps = [
    { icon: User, label: 'Basic Info', completed: completionPercentage >= 25 },
    { icon: Building, label: 'Company Details', completed: completionPercentage >= 50 },
    { icon: Target, label: 'Goals & Experience', completed: completionPercentage >= 75 },
    { icon: TrendingUp, label: 'Complete', completed: completionPercentage >= 100 },
  ];

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Complete Your Profile</CardTitle>
            <CardDescription>
              Help us personalize your experience by completing your profile
            </CardDescription>
          </div>
          <Badge variant="outline">
            {completionPercentage}% Complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={completionPercentage} className="h-2" />
        
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-center space-x-2 ${
                  step.completed ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <step.icon className="w-4 h-4" />
                <span className="text-sm">{step.label}</span>
              </div>
            ))}
          </div>
          
          <Link href="/onboarding/profile">
            <Button size="sm" variant="outline">
              {completionPercentage > 0 ? 'Continue' : 'Start'}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Testing the Implementation

1. **Test Profile Completion Flow**:
   - Sign up as a new user
   - Navigate to `/onboarding/profile`
   - Complete all steps
   - Verify progress is saved

2. **Test Validation**:
   - Try submitting invalid data
   - Check error messages
   - Verify form validation works

3. **Test Progress Persistence**:
   - Complete partial profile
   - Refresh page
   - Verify data is preserved

4. **Test Redirect Logic**:
   - Try accessing dashboard with incomplete profile
   - Verify redirect to profile completion

## Next Steps

After implementing profile completion flow, you can proceed with:

1. Creating the plan selection UI
2. Implementing the full onboarding wizard
3. Adding email verification flow
4. Creating dashboard onboarding tour

This profile completion system provides a solid foundation for personalizing the user experience and improving lead generation quality.