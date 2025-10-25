"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Users, 
  CreditCard, 
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
  Building,
  User,
  Download
} from 'lucide-react';
import Link from 'next/link';

interface SearchCriteria {
  industry?: string;
  location?: string;
  company_size?: string;
  keywords?: string;
  position?: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  position: string;
  linkedin_url: string;
  source: string;
  additional_data: any;
}

interface SearchResult {
  search_id: string;
  status: 'completed' | 'failed';
  results_count: number;
  credits_used: number;
  remaining_credits: number;
  leads: Lead[];
}

interface CreditBalance {
  scraper_credits: {
    total: number;
    held: number;
    available: number;
  };
  interaction_credits: {
    total: number;
    held: number;
    available: number;
  };
}

export default function ScraperPage() {
  const { isSignedIn, userId } = useAuth();
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({});
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'holding' | 'searching' | 'processing'>('idle');

  useEffect(() => {
    if (!isSignedIn || !userId) {
      return;
    }

    const fetchCreditBalance = async () => {
      try {
        const response = await fetch('/api/credits/balance');
        if (response.ok) {
          const data = await response.json();
          setCreditBalance(data);
        }
      } catch (err) {
        console.error('Failed to fetch credit balance:', err);
      }
    };

    const fetchSearchHistory = async () => {
      try {
        const response = await fetch('/api/scraper/search');
        if (response.ok) {
          const data = await response.json();
          setSearchHistory(data.searches || []);
        }
      } catch (err) {
        console.error('Failed to fetch search history:', err);
      }
    };

    fetchCreditBalance();
    fetchSearchHistory();
  }, [isSignedIn, userId]);

  const handleSearch = async () => {
    if (!userId) return;

    setSearching(true);
    setSearchStatus('holding');
    setError(null);
    setSearchResult(null);

    try {
      const estimatedCredits = 50; // Default estimation
      
      // Update status to searching
      setSearchStatus('searching');
      
      const response = await fetch('/api/scraper/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search_criteria: searchCriteria,
          estimated_credits: estimatedCredits,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402 && data.available_credits !== undefined) {
          setError(`Insufficient credits. You have ${data.available_credits} scraper credits available, but ${data.required_credits} are required.${data.held_credits > 0 ? ` (${data.held_credits} credits are currently held for pending operations).` : ''}`);
        } else {
          setError(data.error || 'Search failed');
        }
        return;
      }

      setSearchStatus('processing');
      setSearchResult(data);
      
      // Refresh credit balance
      const balanceResponse = await fetch('/api/credits/balance');
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        setCreditBalance(balanceData);
      }

      // Refresh search history
      const historyResponse = await fetch('/api/scraper/search');
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setSearchHistory(historyData.searches || []);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
      setSearchStatus('idle');
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access the scraper</h1>
          <Link href="/">
            <Button>Go to Home</Button>
          </Link>
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
                Lead Scraper
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Generate high-quality leads using AI-powered search
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Credit Balance */}
        {creditBalance && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Scraper Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-blue-600">
                      {creditBalance.scraper_credits.available.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">Available credits</p>
                  </div>
                  <Badge variant={creditBalance.scraper_credits.available > 50 ? 'default' : 'secondary'}>
                    {creditBalance.scraper_credits.available > 50 ? 'Good' : 'Low'}
                  </Badge>
                </div>
                
                {creditBalance.scraper_credits.held > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Credits held for pending searches:</span>
                    <span className="font-medium text-orange-600">{creditBalance.scraper_credits.held}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total credits:</span>
                  <span className="font-medium">{creditBalance.scraper_credits.total.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="search" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">New Search</TabsTrigger>
            <TabsTrigger value="history">Search History</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-6">
            {/* Search Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Search Criteria
                </CardTitle>
                <CardDescription>
                  Define your target audience and search parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, industry: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technology">Technology</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="consulting">Consulting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Jakarta, Indonesia"
                      value={searchCriteria.location || ''}
                      onChange={(e) => setSearchCriteria(prev => ({ ...prev, location: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company_size">Company Size</Label>
                    <Select onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, company_size: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 employees</SelectItem>
                        <SelectItem value="11-50">11-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="201-500">201-500 employees</SelectItem>
                        <SelectItem value="501-1000">501-1000 employees</SelectItem>
                        <SelectItem value="1000+">1000+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="position">Target Position</Label>
                    <Select onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, position: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ceo">CEO</SelectItem>
                        <SelectItem value="cto">CTO</SelectItem>
                        <SelectItem value="cmo">CMO</SelectItem>
                        <SelectItem value="marketing-manager">Marketing Manager</SelectItem>
                        <SelectItem value="sales-director">Sales Director</SelectItem>
                        <SelectItem value="product-manager">Product Manager</SelectItem>
                        <SelectItem value="hr-manager">HR Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords (optional)</Label>
                  <Textarea
                    id="keywords"
                    placeholder="Enter specific keywords or skills to search for..."
                    value={searchCriteria.keywords || ''}
                    onChange={(e) => setSearchCriteria(prev => ({ ...prev, keywords: e.target.value }))}
                    rows={3}
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleSearch}
                  disabled={searching || !creditBalance || creditBalance.scraper_credits.available < 50}
                  className="w-full"
                >
                  {searching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {searchStatus === 'holding' ? 'Reserving credits...' :
                       searchStatus === 'searching' ? 'Searching leads...' :
                       'Processing...'}
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search Leads (50 credits)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    Search Results
                  </CardTitle>
                  <CardDescription>
                    Found {searchResult.results_count} leads using {searchResult.credits_used} credits
                    {searchResult.credits_refunded > 0 && (
                      <span className="text-green-600 ml-2">
                        ({searchResult.credits_refunded} credits refunded)
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {searchResult.leads.map((lead, index) => (
                      <div key={lead.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <h3 className="font-medium">{lead.name}</h3>
                            <Badge variant="outline">{lead.position}</Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-gray-500" />
                            <span>{lead.company}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-500" />
                            <span>{lead.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span>{lead.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span>{lead.additional_data?.industry} • {lead.additional_data?.company_size} employees</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      <div>Remaining credits: {searchResult.remaining_credits}</div>
                      {searchResult.credits_held > searchResult.credits_used && (
                        <div className="text-green-600">
                          {searchResult.credits_refunded} credits refunded to your account
                        </div>
                      )}
                    </div>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Export Leads
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search History</CardTitle>
                <CardDescription>
                  Your previous lead searches and results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {searchHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">No search history</h3>
                    <p className="text-gray-500">Start your first lead search to see results here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {searchHistory.map((search) => (
                      <div key={search.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={search.status === 'completed' ? 'default' : 'secondary'}>
                              {search.status}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(search.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-sm">
                            {search.results_count} leads • {search.credits_used} credits
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          {JSON.stringify(search.search_criteria, null, 2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}