# AI Marketing SaaS Platform

A comprehensive AI-powered lead generation and marketing automation platform built with Next.js, TypeScript, Clerk, and Supabase.

## 🚀 Features

### Core Functionality
- **AI Lead Scraper**: Generate high-quality leads using advanced AI algorithms
- **WhatsApp Integration**: Direct messaging campaigns with real-time tracking
- **Credit Management**: Flexible credit system for different service types
- **Subscription Management**: Multiple tiers with automated billing
- **Analytics Dashboard**: Real-time insights and performance tracking

### Technical Features
- **Authentication**: Secure user management with Clerk
- **Database**: Robust data management with Supabase
- **API Architecture**: RESTful APIs with proper error handling
- **Responsive Design**: Mobile-first UI with Tailwind CSS
- **Type Safety**: Full TypeScript implementation

## 📋 System Architecture

### Database Schema
- **Users**: User profiles and authentication data
- **Subscriptions**: Plan management and billing cycles
- **Credit Ledger**: Transaction tracking for all credit operations
- **Lead Searches**: Search history and results
- **Leads**: Generated lead data with rich metadata
- **WhatsApp Messages**: Message tracking and delivery status
- **Invoices**: Billing records and payment history
- **Notifications**: User notifications and system alerts

### API Endpoints
- `/api/user` - User profile management
- `/api/subscriptions/*` - Subscription operations
- `/api/credits/*` - Credit balance and transactions
- `/api/scraper/search` - Lead generation
- `/api/whatsapp/send` - WhatsApp messaging
- `/api/billing/*` - Payment processing
- `/api/notifications` - User notifications

## 🛠️ Tech Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Radix UI**: Accessible component library
- **Lucide React**: Icon library
- **Clerk**: Authentication and user management

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **Supabase**: Database and real-time services
- **PostgreSQL**: Primary database with RLS policies
- **Row Level Security**: Data isolation and privacy

### Infrastructure
- **Vercel**: Deployment platform (recommended)
- **Supabase**: Database hosting
- **Clerk**: Authentication service

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- Clerk account

### Setup Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd ai-marketing-platform
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Variables**
Create `.env.local` file with:
```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Billing (Optional)
BILLING_CRON_SECRET=your_cron_secret_key
```

4. **Database Setup**
```bash
# Run Supabase migrations
supabase db push
```

5. **Start Development Server**
```bash
npm run dev
```

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API endpoints
│   │   ├── user/         # User management
│   │   ├── subscriptions/ # Subscription handling
│   │   ├── credits/      # Credit operations
│   │   ├── scraper/      # Lead generation
│   │   ├── whatsapp/     # WhatsApp integration
│   │   ├── billing/      # Payment processing
│   │   └── notifications/ # User notifications
│   ├── dashboard/         # Main dashboard
│   ├── scraper/          # Lead scraper interface
│   ├── whatsapp/         # WhatsApp messaging
│   ├── billing/          # Subscription management
│   └── page.tsx         # Landing page
├── components/            # Reusable UI components
│   └── ui/             # Base component library
├── lib/                 # Utility functions
│   ├── supabase.ts      # Database client
│   ├── user-service.ts   # User management
│   └── utils.ts         # Helper functions
└── supabase/            # Database migrations
    └── migrations/       # SQL schema files
```

## 💳 Subscription Plans

### Trial (Free)
- 100 Scraper Credits
- 150 Interaction Credits
- 14-day duration
- Basic features

### Basic (IDR 2.4M/month)
- 10,000 Scraper Credits
- 15,000 Interaction Credits
- Email support
- Standard features

### Pro (IDR 4.9M/month)
- 25,000 Scraper Credits
- 50,000 Interaction Credits
- Priority support
- API access
- Advanced features

### Enterprise (IDR 9.9M/month)
- 100,000 Scraper Credits
- 200,000 Interaction Credits
- 24/7 support
- Full API access
- Custom integrations

## 🔧 Configuration

### Database Migration
The system uses Supabase migrations for schema management:

```sql
-- Key tables
users                    -- User profiles
subscriptions             -- User subscriptions
subscription_plans        -- Available plans
credit_ledger           -- Credit transactions
lead_searches           -- Search history
leads                   -- Generated leads
whatsapp_messages       -- Message tracking
invoices                -- Billing records
notifications           -- User alerts
```

### Credit System
- **Scraper Credits**: Used for lead generation
- **Interaction Credits**: Used for WhatsApp messages
- **Transaction Types**: trial_allocation, monthly_allocation, topup_purchase, usage, refund
- **Balance Tracking**: Real-time balance calculation

## 🔄 Automated Processes

### Monthly Billing Cycle
- **Cron Job**: Daily check for due subscriptions
- **Payment Processing**: Automated payment attempts
- **Credit Allocation**: Monthly credit distribution
- **Failure Handling**: Retry logic and notifications
- **Status Updates**: Subscription status management

### Credit Management
- **Real-time Tracking**: Immediate balance updates
- **Transaction History**: Complete audit trail
- **Refund Logic**: Automatic refunds on failures
- **Usage Validation**: Credit sufficiency checks

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

## 🚀 Deployment

### Vercel (Recommended)
1. Connect repository to Vercel
2. Configure environment variables
3. Deploy automatically on push to main

### Manual Deployment
```bash
npm run build
npm start
```

## 📊 Monitoring

### Key Metrics
- User acquisition and retention
- Credit usage patterns
- Subscription conversion rates
- API response times
- Error rates and types

### Logging
- Structured error logging
- Performance monitoring
- User activity tracking
- System health checks

## 🔒 Security

### Data Protection
- Row Level Security (RLS) in database
- JWT token authentication
- Input validation and sanitization
- Rate limiting on API endpoints

### Privacy
- GDPR compliance considerations
- Data encryption in transit
- Secure payment processing
- User data isolation

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request
5. Code review and merge

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Documentation
- API documentation: `/api/docs`
- User guide: `/help`
- Status page: `/status`

### Contact
- Email: support@aimarketing.com
- Discord: [Community Server]
- Issues: [GitHub Issues]

## 🗺 Roadmap

### Upcoming Features
- [ ] Advanced lead filtering
- [ ] Email campaign integration
- [ ] Analytics dashboard
- [ ] Mobile app
- [ ] API rate limiting
- [ ] Multi-language support

### Technical Improvements
- [ ] Performance optimization
- [ ] Caching layer
- [ ] Background job processing
- [ ] Real-time notifications
- [ ] Advanced error handling

## 📈 Performance

### Optimization Strategies
- Database indexing
- API response caching
- Image optimization
- Code splitting
- Lazy loading

### Benchmarks
- API response time: <200ms
- Page load time: <2s
- Database queries: <50ms
- Credit processing: <100ms

---

**Built with ❤️ using modern web technologies**