"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  MessageSquare, 
  CreditCard, 
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
  User,
  Send,
  Clock,
  CheckCheck
} from 'lucide-react';
import Link from 'next/link';

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

interface WhatsAppMessage {
  id: string;
  user_id: string;
  lead_id: string | null;
  message_type: 'outgoing' | 'incoming';
  content: string;
  whatsapp_message_id: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  credits_used: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  lead?: Lead;
}

interface CreditBalance {
  scraper_credits: number;
  interaction_credits: number;
}

export default function WhatsAppPage() {
  const { isSignedIn, userId } = useAuth();
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch credit balance
        const balanceResponse = await fetch('/api/credits/balance');
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setCreditBalance(balanceData);
        }

        // Fetch WhatsApp messages
        const messagesResponse = await fetch('/api/whatsapp/send');
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          setMessages(messagesData.messages || []);
        }

        // Fetch leads (mock data for now)
        // In real implementation, this would fetch from /api/leads
        setLeads([
          {
            id: '1',
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+628123456789',
            company: 'TechCorp',
            position: 'CEO',
            linkedin_url: 'https://linkedin.com/in/johndoe',
            source: 'scraper',
            additional_data: { industry: 'Technology', location: 'Jakarta' }
          },
          {
            id: '2',
            name: 'Jane Smith',
            email: 'jane@example.com',
            phone: '+628987654321',
            company: 'HealthPlus',
            position: 'CTO',
            linkedin_url: 'https://linkedin.com/in/janesmith',
            source: 'scraper',
            additional_data: { industry: 'Healthcare', location: 'Surabaya' }
          }
        ]);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };

    fetchData();
  }, [isSignedIn, userId]);

  const handleSendMessage = async () => {
    if (!userId) return;

    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    if (!selectedLead && !phoneNumber.trim()) {
      setError('Please select a lead or enter a phone number');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: selectedLead?.id || null,
          phone_number: phoneNumber || null,
          message: message.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.available_credits !== undefined) {
          setError(`Insufficient credits. You have ${data.available_credits} interaction credits, but ${data.required_credits} are required.`);
        } else {
          setError(data.error || 'Failed to send message');
        }
        return;
      }

      setSuccess('Message sent successfully!');
      setMessage('');
      setSelectedLead(null);
      setPhoneNumber('');

      // Refresh messages and credit balance
      const messagesResponse = await fetch('/api/whatsapp/send');
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        setMessages(messagesData.messages || []);
      }

      const balanceResponse = await fetch('/api/credits/balance');
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        setCreditBalance(balanceData);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-green-500" />;
      case 'read':
        return <CheckCheck className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access WhatsApp</h1>
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
                WhatsApp Integration
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Send messages to your leads using WhatsApp
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
                Available Interaction Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-green-600">
                    {creditBalance.interaction_credits.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Credits available for messaging</p>
                </div>
                <Badge variant={creditBalance.interaction_credits > 10 ? 'default' : 'secondary'}>
                  {creditBalance.interaction_credits > 10 ? 'Good' : 'Low'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="compose" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose">Compose Message</TabsTrigger>
            <TabsTrigger value="history">Message History</TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-6">
            {/* Compose Message */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Compose Message
                </CardTitle>
                <CardDescription>
                  Send a WhatsApp message to your leads
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="lead">Select Lead (optional)</Label>
                    <Select onValueChange={(value) => {
                      const lead = leads.find(l => l.id === value);
                      setSelectedLead(lead || null);
                      if (lead) {
                        setPhoneNumber(lead.phone);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {leads.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {lead.name} - {lead.company} ({lead.position})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+628123456789"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Enter your message here..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                    />
                    <p className="text-sm text-gray-500">
                      1 interaction credit will be used for this message
                    </p>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleSendMessage} 
                  disabled={sending || !creditBalance || creditBalance.interaction_credits < 1}
                  className="w-full"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Message (1 credit)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Available Leads */}
            <Card>
              <CardHeader>
                <CardTitle>Available Leads</CardTitle>
                <CardDescription>
                  Click on a lead to quickly compose a message
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {leads.map((lead) => (
                    <div 
                      key={lead.id} 
                      className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        setSelectedLead(lead);
                        setPhoneNumber(lead.phone);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                          </div>
                          <div>
                            <h3 className="font-medium">{lead.name}</h3>
                            <p className="text-sm text-gray-500">{lead.position} at {lead.company}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <span className="text-sm">{lead.phone}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Message History</CardTitle>
                <CardDescription>
                  Your WhatsApp message history and status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">No messages sent yet</h3>
                    <p className="text-gray-500">Start sending messages to see your history here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(msg.status)}
                            <Badge variant={msg.message_type === 'outgoing' ? 'default' : 'secondary'}>
                              {msg.message_type}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(msg.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {msg.credits_used} credit{msg.credits_used > 1 ? 's' : ''}
                          </div>
                        </div>
                        
                        <div className="mb-2">
                          <p className="font-medium">
                            {msg.lead ? `To: ${msg.lead.name}` : 'To: Custom Number'}
                          </p>
                          {msg.lead && (
                            <p className="text-sm text-gray-500">
                              {msg.lead.company} • {msg.lead.position}
                            </p>
                          )}
                        </div>
                        
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                          <p className="text-sm">{msg.content}</p>
                        </div>
                        
                        {msg.error_message && (
                          <div className="mt-2 text-sm text-red-600">
                            Error: {msg.error_message}
                          </div>
                        )}
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