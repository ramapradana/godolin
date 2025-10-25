"use client";

import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  Search, 
  MessageSquare, 
  CreditCard, 
  TrendingUp,
  Phone,
  Mail,
  Building,
  UserCheck
} from 'lucide-react';
import Link from 'next/link';

interface UserProfile {
  id: string;
  clerk_id: string;
  email: string;
  name?: string;
  phone?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'cancelled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  payment_method_id?: string;
  plan?: {
    name: string;
    price: number;
    scraper_credits: number;
    interaction_credits: number;
    features: any;
  };
}

interface CreditBalance {
  scraper_credits: number;
  interaction_credits: number;
}

interface DashboardData {
  profile: UserProfile | null;
  subscription: Subscription | null;
  credit_balances: CreditBalance;
}

export default function Dashboard() {
  const { isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        const response = await fetch('/api/user');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setDashboardData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [isSignedIn, userId]);

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access your dashboard</h1>
          <Link href="/">
            <Button>Go to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
          <p className="mb-4">{error || 'Failed to load dashboard data'}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  const { profile, subscription, credit_balances } = dashboardData;
  const plan = subscription?.plan;

  // Calculate credit usage percentages
  const scraperUsagePercent = plan ? (credit_balances.scraper_credits / plan.scraper_credits) * 100 : 0;
  const interactionUsagePercent = plan ? (credit_balances.interaction_credits / plan.interaction_credits) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome back, {profile?.name || user?.firstName || 'User'}!
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Manage your leads, credits, and subscription from your dashboard
          </p>
        </div>

        {/* Subscription Status */}
        {subscription && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Current Plan: {plan?.name}
                  </CardTitle>
                  <CardDescription>
                    {subscription.status === 'trial' && 'Trial period - Upgrade anytime'}
                    {subscription.status === 'active' && 'Active subscription'}
                    {subscription.status === 'cancelled' && 'Subscription cancelled'}
                    {subscription.status === 'past_due' && 'Payment overdue'}
                  </CardDescription>
                </div>
                <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                  {subscription.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Monthly Price</p>
                  <p className="text-2xl font-bold">IDR {plan?.price?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Period End</p>
                  <p className="text-lg">
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {subscription.status === 'trial' && (
                <div className="mt-4">
                  <Link href="/billing">
                    <Button>Upgrade Plan</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credit Balances */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Scraper Credits
              </CardTitle>
              <CardDescription>
                Credits for lead generation and searching
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Available</span>
                    <span className="text-sm font-bold">{credit_balances.scraper_credits.toLocaleString()}</span>
                  </div>
                  {plan && (
                    <Progress value={scraperUsagePercent} className="h-2" />
                  )}
                  {plan && (
                    <p className="text-xs text-gray-500 mt-1">
                      {plan.scraper_credits.toLocaleString()} total credits
                    </p>
                  )}
                </div>
                <Link href="/scraper">
                  <Button className="w-full">Use Scraper</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Interaction Credits
              </CardTitle>
              <CardDescription>
                Credits for WhatsApp messages and interactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Available</span>
                    <span className="text-sm font-bold">{credit_balances.interaction_credits.toLocaleString()}</span>
                  </div>
                  {plan && (
                    <Progress value={interactionUsagePercent} className="h-2" />
                  )}
                  {plan && (
                    <p className="text-xs text-gray-500 mt-1">
                      {plan.interaction_credits.toLocaleString()} total credits
                    </p>
                  )}
                </div>
                <Link href="/whatsapp">
                  <Button className="w-full">Send WhatsApp</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">
                    No leads generated yet
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">
                    No messages sent yet
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Credits Used</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {plan ? (plan.scraper_credits - credit_balances.scraper_credits + plan.interaction_credits - credit_balances.interaction_credits) : 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total credits consumed
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Lead Management</CardTitle>
                <CardDescription>
                  Generate and manage your leads here
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No leads yet</h3>
                  <p className="text-gray-500 mb-4">Start generating leads using the scraper tool</p>
                  <Link href="/scraper">
                    <Button>Generate Leads</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp Messages</CardTitle>
                <CardDescription>
                  Send and track your WhatsApp messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No messages yet</h3>
                  <p className="text-gray-500 mb-4">Start sending WhatsApp messages to your leads</p>
                  <Link href="/whatsapp">
                    <Button>Send Message</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Billing & Credits</CardTitle>
                <CardDescription>
                  Manage your subscription and purchase additional credits
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link href="/billing">
                      <Button variant="outline" className="w-full">
                        <CreditCard className="w-4 h-4 mr-2" />
                        Manage Subscription
                      </Button>
                    </Link>
                    <Link href="/credits">
                      <Button variant="outline" className="w-full">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Buy More Credits
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}