# Frontend Interaction Credit Integration Guide

## Overview

This guide provides detailed instructions for updating the frontend components to display and manage interaction credits for WhatsApp messaging. The updates will provide users with clear visibility into their interaction credit usage, including held credits during message operations.

## Current Frontend Analysis

Based on the existing file structure, the main components that need updates are:
- `src/app/dashboard/page.tsx` - Main dashboard with credit display
- `src/app/whatsapp/page.tsx` - WhatsApp messaging interface
- `src/app/billing/page.tsx` - Billing and credit management

## Implementation Components

### 1. Enhanced Credit Display Component

Create a reusable component to display interaction credits:

```typescript
// src/components/credits/interaction-credit-display.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InteractionCredits {
  total: number;
  held: number;
  available: number;
}

interface InteractionCreditDisplayProps {
  showDetails?: boolean;
  showRefreshButton?: boolean;
  compact?: boolean;
}

export function InteractionCreditDisplay({
  showDetails = true,
  showRefreshButton = true,
  compact = false
}: InteractionCreditDisplayProps) {
  const [credits, setCredits] = useState<InteractionCredits>({
    total: 0,
    held: 0,
    available: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/credits/interaction/balance');
      if (!response.ok) {
        throw new Error('Failed to fetch interaction credits');
      }
      
      const data = await response.json();
      setCredits(data.interaction_credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
    
    // Set up periodic refresh every 30 seconds
    const interval = setInterval(fetchCredits, 30000);
    return () => clearInterval(interval);
  }, []);

  const usagePercentage = credits.total > 0 ? ((credits.total - credits.available) / credits.total) * 100 : 0;

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">Interaction Credits:</span>
        <Badge variant={credits.available > 10 ? "default" : "destructive"}>
          {credits.available}
        </Badge>
        {credits.held > 0 && (
          <Badge variant="secondary">
            {credits.held} held
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Interaction Credits</CardTitle>
        <div className="flex items-center space-x-2">
          {showRefreshButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchCredits}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="w-200 text-sm">
                  Interaction credits are used for WhatsApp messages. 
                  Held credits are temporarily reserved for ongoing operations.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            Error loading credits: {error}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{credits.available}</span>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  {credits.total} total
                </div>
                {credits.held > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {credits.held} held
                  </div>
                )}
              </div>
            </div>
            
            {showDetails && (
              <>
                <Progress value={usagePercentage} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Used: {credits.total - credits.available}</span>
                  <span>Available: {credits.available}</span>
                </div>
                
                {credits.held > 0 && (
                  <div className="mt-2 p-2 bg-muted rounded">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Active Holds ({credits.held} credits)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Credits are temporarily held for ongoing WhatsApp operations.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 2. WhatsApp Message Status Component

Create a component to show real-time message status and credit usage:

```typescript
// src/components/whatsapp/message-status-indicator.tsx
'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

interface MessageStatus {
  id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  credits_used: number;
  hold_id?: string;
  error_message?: string;
  created_at: string;
}

interface MessageStatusIndicatorProps {
  messageId: string;
  initialStatus?: MessageStatus;
}

export function MessageStatusIndicator({ 
  messageId, 
  initialStatus 
}: MessageStatusIndicatorProps) {
  const [status, setStatus] = useState<MessageStatus | null>(initialStatus || null);
  const [loading, setLoading] = useState(!initialStatus);

  useEffect(() => {
    if (!initialStatus) {
      fetchMessageStatus();
    }
  }, [messageId, initialStatus]);

  const fetchMessageStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/whatsapp/messages/${messageId}`);
      if (response.ok) {
        const messageData = await response.json();
        setStatus(messageData);
      }
    } catch (error) {
      console.error('Error fetching message status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'read':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'read':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-3">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon(status.status)}
            <Badge className={getStatusColor(status.status)}>
              {status.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {status.credits_used} credit{status.credits_used !== 1 ? 's' : ''}
            </span>
          </div>
          {status.hold_id && status.status === 'pending' && (
            <Badge variant="outline">
              Credit held
            </Badge>
          )}
        </div>
        
        {status.error_message && (
          <div className="mt-2 text-sm text-destructive">
            {status.error_message}
          </div>
        )}
        
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(status.created_at).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3. Updated Dashboard Page

Update the dashboard to show both scraper and interaction credits:

```typescript
// src/app/dashboard/page.tsx (updated sections)
import { InteractionCreditDisplay } from '@/components/credits/interaction-credit-display';
import { ScraperCreditDisplay } from '@/components/credits/scraper-credit-display';

// Update the credits section in the dashboard
export default function DashboardPage() {
  // ... existing code ...

  return (
    <div className="space-y-6">
      {/* ... existing header and other sections ... */}
      
      {/* Credits Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <ScraperCreditDisplay />
        <InteractionCreditDisplay />
      </div>
      
      {/* ... rest of the dashboard ... */}
    </div>
  );
}
```

### 4. Enhanced WhatsApp Page

Update the WhatsApp messaging interface with credit awareness:

```typescript
// src/app/whatsapp/page.tsx (updated sections)
'use client';

import { useState, useEffect } from 'react';
import { InteractionCreditDisplay } from '@/components/credits/interaction-credit-display';
import { MessageStatusIndicator } from '@/components/whatsapp/message-status-indicator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Send, AlertTriangle } from 'lucide-react';

interface WhatsAppMessage {
  id: string;
  content: string;
  status: string;
  credits_used: number;
  created_at: string;
}

export default function WhatsAppPage() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [credits, setCredits] = useState({ available: 0, held: 0 });
  const [error, setError] = useState<string | null>(null);

  // Fetch interaction credits
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const response = await fetch('/api/credits/interaction/balance');
        if (response.ok) {
          const data = await response.json();
          setCredits(data.interaction_credits);
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    };

    fetchCredits();
    const interval = setInterval(fetchCredits, 30000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = async () => {
    if (!message.trim()) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          // Add other required fields like lead_id or phone_number
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Add message to local state
        setMessages(prev => [{
          id: data.message_id,
          content: message.trim(),
          status: data.status,
          credits_used: data.credits_used,
          created_at: new Date().toISOString()
        }, ...prev]);
        
        setMessage('');
        
        // Refresh credits
        const creditsResponse = await fetch('/api/credits/interaction/balance');
        if (creditsResponse.ok) {
          const creditsData = await creditsResponse.json();
          setCredits(creditsData.interaction_credits);
        }
      } else {
        setError(data.error || 'Failed to send message');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Credit Display */}
      <InteractionCreditDisplay compact={false} />
      
      {/* Credit Warning */}
      {credits.available <= 5 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have {credits.available} interaction credit{credits.available !== 1 ? 's' : ''} remaining. 
            {credits.held > 0 && ` ${credits.held} credit${credits.held !== 1 ? 's' : ''} currently held for pending operations.`}
            Consider topping up your credits to continue sending messages.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Message Composition */}
      <Card>
        <CardHeader>
          <CardTitle>Send WhatsApp Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending || credits.available <= 0}
            rows={4}
          />
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {message.length} characters • 1 credit per message
            </span>
            <Button
              onClick={sendMessage}
              disabled={!message.trim() || sending || credits.available <= 0}
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {/* Message History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                <div className="p-3 bg-muted rounded">
                  <p className="text-sm">{msg.content}</p>
                </div>
                <MessageStatusIndicator messageId={msg.id} initialStatus={msg} />
              </div>
            ))}
            
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No messages sent yet. Start a conversation above!
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 5. Credit Usage History Component

Create a component to show interaction credit transaction history:

```typescript
// src/components/credits/interaction-credit-history.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, MessageSquare, CreditCard, AlertCircle } from 'lucide-react';

interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  source: string;
  description: string;
  created_at: string;
  reference_id?: string;
}

interface CreditHold {
  id: string;
  amount: number;
  reference_id: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export function InteractionCreditHistory() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [holds, setHolds] = useState<CreditHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'holds'>('transactions');

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch transactions
      const transactionsResponse = await fetch('/api/credits/interaction/transactions');
      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json();
        setTransactions(transactionsData.transactions || []);
      }
      
      // Fetch holds
      const holdsResponse = await fetch('/api/credits/interaction/holds');
      if (holdsResponse.ok) {
        const holdsData = await holdsResponse.json();
        setHolds(holdsData.holds || []);
      }
    } catch (error) {
      console.error('Error fetching credit history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getTransactionIcon = (source: string) => {
    switch (source) {
      case 'usage':
        return <MessageSquare className="h-4 w-4 text-red-500" />;
      case 'refund':
        return <CreditCard className="h-4 w-4 text-green-500" />;
      case 'monthly_allocation':
      case 'trial_allocation':
        return <CreditCard className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getHoldStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-yellow-100 text-yellow-800';
      case 'converted':
        return 'bg-green-100 text-green-800';
      case 'released':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Interaction Credit History</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={activeTab === 'transactions' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </Button>
          <Button
            variant={activeTab === 'holds' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('holds')}
          >
            Holds
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <ScrollArea className="h-96">
            {activeTab === 'transactions' ? (
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-start space-x-3 p-3 border rounded">
                    {getTransactionIcon(transaction.source)}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {transaction.description}
                        </span>
                        <Badge variant={transaction.amount < 0 ? "destructive" : "default"}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Balance: {transaction.balance_after} • 
                        {new Date(transaction.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                
                {transactions.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No transactions found
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {holds.map((hold) => (
                  <div key={hold.id} className="flex items-start space-x-3 p-3 border rounded">
                    <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          Hold for {hold.reference_id}
                        </span>
                        <Badge className={getHoldStatusColor(hold.status)}>
                          {hold.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {hold.amount} credits • 
                        Expires: {new Date(hold.expires_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {new Date(hold.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                
                {holds.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No credit holds found
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
```

## Implementation Steps

### Step 1: Create Credit Components

1. Create the interaction credit display component
2. Create the message status indicator component
3. Create the credit history component
4. Test components individually

### Step 2: Update Dashboard

1. Import the new credit display component
2. Update the dashboard layout to show both credit types
3. Add real-time credit updates
4. Test credit display functionality

### Step 3: Enhance WhatsApp Page

1. Add credit display to WhatsApp page
2. Implement credit-aware message sending
3. Add message status indicators
4. Implement credit warnings and alerts

### Step 4: Add Credit History

1. Create credit history page or section
2. Implement transaction and hold views
3. Add filtering and search capabilities
4. Test history functionality

### Step 5: Real-time Updates

1. Implement WebSocket or polling for real-time updates
2. Update credit displays when operations complete
3. Add notifications for credit changes
4. Test real-time functionality

## Testing Strategy

### Unit Tests

1. **Component Tests**
   - Test credit display rendering
   - Test status indicator updates
   - Test error handling

2. **Integration Tests**
   - Test API integration
   - Test real-time updates
   - Test user interactions

### End-to-End Tests

1. **User Flow Tests**
   - Test complete message sending flow
   - Test credit usage tracking
   - Test error scenarios

2. **Performance Tests**
   - Test rendering performance
   - Test real-time update performance
   - Test memory usage

## Accessibility Considerations

1. **Screen Reader Support**
   - Add proper ARIA labels
   - Implement keyboard navigation
   - Provide text alternatives

2. **Visual Accessibility**
   - Ensure sufficient color contrast
   - Provide clear visual indicators
   - Support high contrast mode

3. **Cognitive Accessibility**
   - Use clear and simple language
   - Provide helpful error messages
   - Implement consistent patterns

## Performance Optimization

1. **Component Optimization**
   - Use React.memo for expensive components
   - Implement virtual scrolling for long lists
   - Optimize re-renders

2. **API Optimization**
   - Implement request caching
   - Use debouncing for frequent requests
   - Optimize payload sizes

3. **Real-time Updates**
   - Use efficient polling intervals
   - Implement connection pooling
   - Handle connection failures gracefully

## Conclusion

This frontend integration guide provides a comprehensive approach to updating the UI components to display and manage interaction credits. The implementation ensures:

1. **Clear Visibility** of credit usage and status
2. **Real-time Updates** during operations
3. **User-friendly Interface** with proper feedback
4. **Accessibility** for all users
5. **Performance** optimization for smooth experience

Following this guide will result in a user-friendly interface that provides clear visibility into interaction credit usage and enhances the overall WhatsApp messaging experience.