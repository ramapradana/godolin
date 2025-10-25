"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CreditCard, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Star,
  ArrowRight,
  Download,
  Calendar
} from 'lucide-react';
import Link from 'next/link';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  scraper_credits: number;
  interaction_credits: number;
  features: any;
  is_active: boolean;
}

interface CreditPackage {
  id: string;
  name: string;
  description: string;
  scraper_credits: number;
  price: number;
  is_active: boolean;
}

interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'cancelled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  payment_method_id?: string;
  plan?: SubscriptionPlan;
}

export default function BillingPage() {
  const { isSignedIn, userId } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch user data including subscription
        const userResponse = await fetch('/api/user');
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setSubscription(userData.subscription);
        }

        // Fetch subscription plans
        const plansResponse = await fetch('/api/subscriptions/plans');
        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          setPlans(plansData.plans || []);
        }

        // Fetch credit packages
        const packagesResponse = await fetch('/api/credits/packages');
        if (packagesResponse.ok) {
          const packagesData = await packagesResponse.json();
          setCreditPackages(packagesData.packages || []);
        }
      } catch (err) {
        console.error('Failed to fetch billing data:', err);
        setError('Failed to load billing information');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isSignedIn, userId]);

  const handleUpgradeSubscription = async (planId: string) => {
    if (!userId) return;

    setUpgrading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/subscriptions/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to upgrade subscription');
        return;
      }

      setSuccess('Subscription upgraded successfully!');
      
      // Refresh subscription data
      const userResponse = await fetch('/api/user');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setSubscription(userData.subscription);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade subscription');
    } finally {
      setUpgrading(false);
    }
  };

  const handlePurchaseCredits = async (packageId: string) => {
    if (!userId) return;

    setPurchasing(packageId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/billing/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to purchase credits');
        return;
      }

      setSuccess('Credits purchased successfully!');
      
      // Refresh credit balance
      const balanceResponse = await fetch('/api/credits/balance');
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        // Update UI with new balance if needed
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purchase credits');
    } finally {
      setPurchasing(null);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access billing</h1>
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
          <p className="mt-4 text-lg">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Billing & Subscription
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Manage your subscription and purchase additional credits
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Current Subscription */}
        {subscription && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Current Subscription
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xl font-semibold">{subscription.plan?.name}</h3>
                    <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                      {subscription.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monthly Price:</span>
                      <span className="font-medium">IDR {subscription.plan?.price?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Scraper Credits:</span>
                      <span className="font-medium">{subscription.plan?.scraper_credits?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Interaction Credits:</span>
                      <span className="font-medium">{subscription.plan?.interaction_credits?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Current Period</span>
                    </div>
                    <div className="text-sm">
                      <div>Start: {new Date(subscription.current_period_start).toLocaleDateString()}</div>
                      <div>End: {new Date(subscription.current_period_end).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {subscription.status === 'trial' && (
                    <div className="mt-4">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          You're on a trial plan. Upgrade to a paid plan to continue using the service after your trial ends.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="plans" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans">Subscription Plans</TabsTrigger>
            <TabsTrigger value="credits">Credit Packages</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => (
                <Card key={plan.id} className={`relative ${plan.name === 'Basic' ? 'border-blue-500 border-2' : ''}`}>
                  {plan.name === 'Basic' && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-blue-500 text-white">Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <div className="text-3xl font-bold">
                      IDR {plan.price.toLocaleString()}
                      <span className="text-sm font-normal text-gray-500">/month</span>
                    </div>
                    <CardDescription>
                      {plan.name === 'Trial' && 'Perfect for getting started'}
                      {plan.name === 'Basic' && 'Great for small businesses'}
                      {plan.name === 'Pro' && 'Ideal for growing companies'}
                      {plan.name === 'Enterprise' && 'Best for large organizations'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <span className="text-sm">{plan.scraper_credits.toLocaleString()} scraper credits</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                        <span className="text-sm">{plan.interaction_credits.toLocaleString()} interaction credits</span>
                      </div>
                      {plan.features && typeof plan.features === 'object' && (
                        <>
                          {plan.features.support && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm">{plan.features.support} support</span>
                            </div>
                          )}
                          {plan.features.api_access && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm">API access</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <Button 
                      className="w-full"
                      disabled={upgrading || (subscription && subscription.plan?.name === plan.name)}
                      onClick={() => handleUpgradeSubscription(plan.id)}
                    >
                      {upgrading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : subscription && subscription.plan?.name === plan.name ? (
                        'Current Plan'
                      ) : (
                        <>
                          {plan.name === 'Trial' ? 'Start Trial' : 'Upgrade'}
                          <ArrowRight className="ml-2 w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="credits" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Purchase Additional Credits
                </CardTitle>
                <CardDescription>
                  Buy more scraper credits to continue generating leads
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {creditPackages.map((pkg) => (
                    <Card key={pkg.id} className="border">
                      <CardHeader className="text-center">
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                        <div className="text-2xl font-bold">
                          IDR {pkg.price.toLocaleString()}
                        </div>
                        <CardDescription>{pkg.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">
                            {pkg.scraper_credits.toLocaleString()}
                          </div>
                          <p className="text-sm text-gray-500">scraper credits</p>
                        </div>
                        <Button 
                          className="w-full"
                          disabled={purchasing === pkg.id}
                          onClick={() => handlePurchaseCredits(pkg.id)}
                        >
                          {purchasing === pkg.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              Purchase
                              <ArrowRight className="ml-2 w-4 h-4" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}