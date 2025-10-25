# Billing Cycle Setup and Deployment Guide

This guide provides step-by-step instructions for setting up and deploying the Monthly Billing Cycle automated system process.

## Prerequisites

1. **Node.js 18+** - Runtime environment
2. **PostgreSQL 14+** - Database with Supabase
3. **iPaymu Account** - Payment gateway with sandbox access
4. **Email Service** - For sending notifications (e.g., SendGrid, AWS SES)
5. **Redis (Optional)** - For caching and session management

## 1. Environment Configuration

### 1.1 Environment Variables

Create a `.env.local` file in your project root with the following variables:

```env
# Application Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/database
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# iPaymu Payment Gateway
IPAYMU_API_KEY=your-production-api-key
IPAYMU_SANDBOX=false
IPAYMU_WEBHOOK_SECRET=your-webhook-secret

# Billing Cron Security
BILLING_CRON_SECRET=your-secure-billing-cron-secret-key

# Email Configuration
EMAIL_SERVICE_PROVIDER=sendgrid
EMAIL_FROM_ADDRESS=billing@your-domain.com
EMAIL_FROM_NAME=Your Company Billing
SENDGRID_API_KEY=your-sendgrid-api-key

# PDF Generation
PDF_STORAGE_PATH=./invoices
PDF_STORAGE_TYPE=local # or 's3', 'gcs'

# Monitoring and Alerting
MONITORING_WEBHOOK_URL=your-monitoring-webhook-url
SENTRY_DSN=your-sentry-dsn

# Redis (Optional)
REDIS_URL=redis://localhost:6379

# File Storage (Optional)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket
```

### 1.2 Development Environment

For development, create a `.env.development` file:

```env
NODE_ENV=development
IPAYMU_API_KEY=SANDBOXA347EEFB-07CD-4845-9610-7FB88CCC9D84
IPAYMU_SANDBOX=true
BILLING_CRON_SECRET=dev-billing-secret
```

## 2. Database Setup

### 2.1 Run Database Migrations

Execute the migrations in order:

```bash
# Migration 001: Example tables (already exists)
# Migration 002: SaaS marketing schema (already exists)
# Migration 003: Credit hold mechanism (already exists)

# New migration for billing cycle
supabase db push supabase/migrations/004_billing_cycle_enhancements.sql
```

### 2.2 Verify Database Functions

Check that all database functions are created correctly:

```sql
-- Test credit functions
SELECT reset_interaction_credits('test-user', 15000, 'test-ref', 'Test reset');
SELECT add_scraper_credits('test-user', 10000, 'test-ref', 'Test addition');

-- Test billing functions
SELECT get_subscriptions_due_for_renewal(CURRENT_DATE);
SELECT get_subscriptions_with_pending_retries(CURRENT_DATE);

-- Test retry schedule
SELECT get_retry_schedule(NOW());
```

### 2.3 Create Indexes

Ensure all indexes are created for optimal performance:

```sql
-- Verify indexes exist
SELECT indexname FROM pg_indexes WHERE tablename IN (
  'payment_retries', 
  'billing_logs', 
  'credit_ledger', 
  'subscriptions'
);
```

## 3. Payment Gateway Setup

### 3.1 iPaymu Configuration

1. **Create iPaymu Account**
   - Sign up at [iPaymu](https://ipaymu.com)
   - Complete verification process
   - Get API keys for both sandbox and production

2. **Configure Webhooks**
   - Set webhook URL: `https://your-domain.com/api/billing/webhook`
   - Enable payment status notifications
   - Configure webhook signature verification

3. **Test Integration**
   - Use sandbox API key for testing
   - Create test payments
   - Verify webhook notifications

### 3.2 Payment Methods

Configure supported payment methods in iPaymu dashboard:

- Credit/Debit Cards
- Bank Transfer
- E-Wallets (OVO, GoPay, Dana)
- Virtual Accounts

## 4. Email Service Setup

### 4.1 SendGrid Configuration

1. **Create SendGrid Account**
   - Sign up at [SendGrid](https://sendgrid.com)
   - Verify sender domain
   - Create API key

2. **Configure Email Templates**
   - Billing success notification
   - Payment failure notification
   - Subscription cancellation notification
   - Retry notification

3. **Template Variables**

```html
<!-- Billing Success Template -->
<h1>Subscription Renewed Successfully</h1>
<p>Hi {{customer_name}},</p>
<p>Your {{plan_name}} subscription has been renewed for another month.</p>
<p>Amount charged: IDR {{amount}}</p>
<p>Next billing date: {{next_billing_date}}</p>
<p>Invoice: <a href="{{invoice_url}}">View Invoice</a></p>
```

### 4.2 Alternative Email Services

If using AWS SES or other providers:

```typescript
// src/lib/email-service.ts
import AWS from 'aws-sdk';

export class SESEmailService {
  private ses: AWS.SES;

  constructor() {
    this.ses = new AWS.SES({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
  }) {
    // Implementation for SES email sending
  }
}
```

## 5. Application Deployment

### 5.1 Build Application

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start production server
npm start
```

### 5.2 Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - IPAYMU_API_KEY=${IPAYMU_API_KEY}
      - BILLING_CRON_SECRET=${BILLING_CRON_SECRET}
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

volumes:
  postgres_data:
```

### 5.3 Vercel Deployment

For Vercel deployment:

1. **Configure Environment Variables**
   - Add all environment variables to Vercel dashboard
   - Set up secrets for sensitive data

2. **Configure Cron Jobs**
   - Vercel Cron Jobs configuration in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/billing/renew",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/billing/retry",
      "schedule": "0 3 * * *"
    }
  ]
}
```

3. **Deploy**
   ```bash
   vercel --prod
   ```

## 6. Monitoring and Logging

### 6.1 Application Monitoring

Set up monitoring with Sentry:

```typescript
// src/lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

export function captureBillingError(error: Error, context: any) {
  Sentry.captureException(error, {
    tags: {
      component: 'billing',
    },
    extra: context,
  });
}
```

### 6.2 Health Checks

Implement health check endpoint:

```typescript
// src/app/api/health/route.ts
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabaseHealth(),
      payment_gateway: await checkPaymentGatewayHealth(),
      email_service: await checkEmailServiceHealth(),
    },
  };

  return NextResponse.json(health);
}
```

### 6.3 Log Management

Configure structured logging:

```typescript
// src/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});
```

## 7. Security Configuration

### 7.1 API Security

1. **Rate Limiting**
   ```typescript
   // src/lib/rate-limiter.ts
   import rateLimit from 'express-rate-limit';
   
   export const billingRateLimit = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // limit each IP to 100 requests per windowMs
     message: 'Too many requests from this IP',
   });
   ```

2. **CORS Configuration**
   ```typescript
   // next.config.js
   module.exports = {
     async headers() {
       return [
         {
           source: '/api/billing/:path*',
           headers: [
             { key: 'Access-Control-Allow-Origin', value: 'https://your-domain.com' },
             { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
             { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
           ],
         },
       ];
     },
   };
   ```

### 7.2 Database Security

1. **Row Level Security**
   - Ensure RLS policies are enabled
   - Test policies with different user roles

2. **Connection Security**
   - Use SSL for database connections
   - Implement connection pooling

### 7.3 Payment Security

1. **Webhook Verification**
   ```typescript
   // src/lib/webhook-verification.ts
   import crypto from 'crypto';
   
   export function verifyWebhookSignature(payload: string, signature: string): boolean {
     const webhookSecret = process.env.IPAYMU_WEBHOOK_SECRET;
     const expectedSignature = crypto
       .createHmac('sha256', webhookSecret)
       .update(payload)
       .digest('hex');
       
     return crypto.timingSafeEqual(
       Buffer.from(signature),
       Buffer.from(expectedSignature)
     );
   }
   ```

2. **PCI Compliance**
   - Never store full credit card details
   - Use tokenization for payment methods
   - Regular security audits

## 8. Backup and Recovery

### 8.1 Database Backups

Configure automated backups:

```sql
-- Daily backup script
pg_dump -h localhost -U postgres -d your_database > backup_$(date +%Y%m%d).sql

-- Restore from backup
psql -h localhost -U postgres -d your_database < backup_20231201.sql
```

### 8.2 File Storage Backups

For invoice PDFs and other files:

```bash
# Local backup
rsync -av ./invoices/ /backup/invoices/

# S3 backup
aws s3 sync ./invoices/ s3://your-backup-bucket/invoices/
```

### 8.3 Disaster Recovery Plan

1. **Recovery Procedures**
   - Document step-by-step recovery process
   - Test recovery procedures regularly
   - Maintain contact information for key personnel

2. **Redundancy**
   - Multi-region deployment
   - Database replication
   - Load balancing

## 9. Performance Optimization

### 9.1 Database Optimization

1. **Query Optimization**
   ```sql
   -- Analyze slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   
   -- Create appropriate indexes
   CREATE INDEX CONCURRENTLY idx_subscriptions_renewal_date 
   ON subscriptions (DATE(current_period_end));
   ```

2. **Connection Pooling**
   ```typescript
   // src/lib/database-pool.ts
   import { Pool } from 'pg';
   
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

### 9.2 Caching Strategy

Implement Redis caching:

```typescript
// src/lib/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function getCachedData(key: string) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCachedData(key: string, data: any, ttl = 3600) {
  await redis.setex(key, ttl, JSON.stringify(data));
}
```

## 10. Testing in Production

### 10.1 Canary Deployment

1. **Phase 1: Test Users**
   - Deploy to small subset of users
   - Monitor for issues
   - Collect feedback

2. **Phase 2: Expanded Rollout**
   - Increase user base gradually
   - Monitor performance metrics
   - Adjust as needed

3. **Phase 3: Full Rollout**
   - Deploy to all users
   - Continue monitoring
   - Optimize based on data

### 10.2 A/B Testing

Test different approaches:

```typescript
// src/lib/experiment.ts
export function isInExperiment(userId: string, experimentName: string): boolean {
  const hash = hashUserId(userId);
  return hash % 100 < 50; // 50% in experiment group
}
```

## 11. Maintenance Procedures

### 11.1 Regular Maintenance

1. **Daily Tasks**
   - Check billing logs for errors
   - Monitor payment success rates
   - Review system performance

2. **Weekly Tasks**
   - Review retry queue
   - Check subscription health
   - Update documentation

3. **Monthly Tasks**
   - Analyze billing metrics
   - Review security logs
   - Update dependencies

### 11.2 Troubleshooting Guide

Common issues and solutions:

1. **Payment Failures**
   - Check iPaymu status
   - Verify API credentials
   - Review webhook configuration

2. **Credit Allocation Issues**
   - Check database functions
   - Verify transaction logs
   - Review credit ledger

3. **Scheduler Issues**
   - Check cron configuration
   - Verify environment variables
   - Review application logs

## 12. Rollback Procedures

### 12.1 Emergency Rollback

1. **Database Rollback**
   ```sql
   -- Rollback to previous migration
   -- This should be done carefully with proper backups
   ```

2. **Application Rollback**
   ```bash
   # Rollback to previous version
   git checkout previous-tag
   npm run build
   npm start
   ```

### 12.2 Data Recovery

1. **Partial Rollback**
   - Identify affected transactions
   - Create compensation transactions
   - Notify affected users

2. **Full Recovery**
   - Restore from backup
   - Reapply changes since backup
   - Verify data integrity

This comprehensive setup and deployment guide ensures a smooth and secure implementation of the Monthly Billing Cycle system.