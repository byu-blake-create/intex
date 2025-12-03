# AWS Elastic Beanstalk Deployment Guide

## Prerequisites

1. **AWS Account** with access to:
   - Elastic Beanstalk
   - RDS (PostgreSQL)
   - Amazon SES (Simple Email Service)

2. **Verified Email Addresses in SES**:
   - Verify the sender email address (e.g., noreply@ellarises.org)
   - Verify recipient email address for contact form (e.g., contact@ellarises.org)
   - **Production**: Request production access (SES starts in sandbox mode)

3. **SES SMTP Credentials**:
   - Go to AWS SES Console → SMTP Settings
   - Click "Create My SMTP Credentials"
   - Save the SMTP username and password (you'll need these)

---

## Step 1: Database Configuration

### Option A: Use Elastic Beanstalk RDS (Recommended for Development)
1. When creating/configuring your EB environment:
   - Go to Configuration → Database
   - Enable database creation
   - Select PostgreSQL
   - Set database name: `ella_rises`
   - Choose appropriate instance class

### Option B: Use Separate RDS Instance (Recommended for Production)
1. Create RDS PostgreSQL instance separately
2. Note the endpoint, port, username, password
3. Configure security groups to allow EB instance access

---

## Step 2: Configure Environment Variables in Elastic Beanstalk

Navigate to: **Elastic Beanstalk Console → Your Environment → Configuration → Software**

Add the following environment properties:

### Database Configuration (if using separate RDS)
```
RDS_HOSTNAME=your-rds-endpoint.region.rds.amazonaws.com
RDS_PORT=5432
RDS_USERNAME=postgres
RDS_PASSWORD=your-secure-password
RDS_DB_NAME=ella_rises
DB_SSL=true
```

### Email Configuration (Amazon SES)
```
MAIL_HOST=email-smtp.us-east-1.amazonaws.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-ses-smtp-username
MAIL_PASS=your-ses-smtp-password
MAIL_FROM="Ella Rises <noreply@ellarises.org>"
MAIL_TO=contact@ellarises.org
```

### Session Configuration
```
SESSION_SECRET=your-super-secret-session-key-change-this
NODE_ENV=production
PORT=8080
```

**Important Notes**:
- Replace `us-east-1` with your AWS region
- The SES SMTP host format is: `email-smtp.{region}.amazonaws.com`
- Common regions: us-east-1, us-west-2, eu-west-1
- **Never commit credentials to git**

---

## Step 3: Prepare Application for Deployment

### 1. Create .ebignore file
```bash
echo "node_modules/
.env
.git/
*.log
.DS_Store
Database Information/
.aws/
.claude/" > .ebignore
```

### 2. Ensure package.json has start script
```json
{
  "scripts": {
    "start": "node app.js"
  }
}
```

### 3. Database Setup Script
You'll need to run the database schema setup on the RDS instance:

```bash
# Connect to RDS from EB instance (via SSH) or local machine
psql -h your-rds-endpoint.region.rds.amazonaws.com -U postgres -d ella_rises -f database-setup-new.sql

# Import CSV data
node import-csv-data.js
```

---

## Step 4: Deploy to Elastic Beanstalk

### Option A: Using EB CLI (Recommended)

1. **Install EB CLI**:
```bash
pip install awsebcli --upgrade
```

2. **Initialize EB Application**:
```bash
cd /root/intex
eb init
```
- Select your region
- Choose "Create new application" or use existing
- Application name: `ella-rises`
- Select Node.js platform
- Choose latest Node.js version
- Do NOT enable CodeCommit
- Setup SSH if desired

3. **Create Environment**:
```bash
eb create ella-rises-prod
```
- Environment name: `ella-rises-prod`
- DNS CNAME prefix: `ella-rises` (or your preference)
- Select load balancer type: Application

4. **Deploy Application**:
```bash
eb deploy
```

5. **Open Application**:
```bash
eb open
```

### Option B: Using AWS Console

1. **Zip your application**:
```bash
cd /root/intex
zip -r ella-rises.zip . -x "node_modules/*" ".git/*" ".env" "Database Information/*"
```

2. **Upload to Elastic Beanstalk**:
   - Go to Elastic Beanstalk Console
   - Create new application or select existing
   - Create new environment (Web server environment)
   - Upload `ella-rises.zip`
   - Configure environment variables (see Step 2)
   - Launch

---

## Step 5: Amazon SES Setup

### 1. Verify Email Addresses
```
AWS SES Console → Email Addresses → Verify a New Email Address
```
- Verify: `noreply@ellarises.org`
- Verify: `contact@ellarises.org`
- Check inbox for verification emails

### 2. Move Out of Sandbox (Production)
- By default, SES is in sandbox mode (can only send to verified emails)
- To send to any email:
  1. Go to SES Console → Sending Statistics
  2. Click "Request Production Access"
  3. Fill out use case (Contact form for non-profit organization)
  4. Typical approval: 24-48 hours

### 3. Test Email Configuration
After deployment, test the contact form:
- Navigate to: `https://your-app.elasticbeanstalk.com/contact`
- Submit a test message
- Check recipient inbox

---

## Step 6: Database Migration

### Connect to RDS from EB Instance

1. **SSH into EB instance**:
```bash
eb ssh
```

2. **Install PostgreSQL client**:
```bash
sudo yum install postgresql
```

3. **Connect to RDS**:
```bash
psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d $RDS_DB_NAME
```

4. **Run schema setup**:
```bash
# Upload schema file to EB instance
scp -i your-key.pem database-setup-new.sql ec2-user@your-instance:/tmp/

# On EB instance
psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d $RDS_DB_NAME -f /tmp/database-setup-new.sql
```

5. **Import CSV data**:
```bash
# Upload CSV files and import script to EB instance
# Then run:
node import-csv-data.js
```

---

## Step 7: Post-Deployment Checklist

- [ ] Application loads at EB URL
- [ ] Database connection successful
- [ ] Can login as admin
- [ ] Contact form sends emails via SES
- [ ] All pages load without errors
- [ ] Check EB logs for any issues: `eb logs`
- [ ] SSL certificate configured (optional, recommended)
- [ ] Custom domain configured (optional)

---

## Troubleshooting

### Database Connection Issues
```bash
# Check environment variables
eb printenv

# View logs
eb logs

# SSH and test connection
eb ssh
env | grep RDS
psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d $RDS_DB_NAME
```

### Email Not Sending
- Verify SES email addresses
- Check SES sending limits
- Review MAIL_* environment variables
- Check application logs: `eb logs`
- Verify SES SMTP credentials are correct

### Application Crashes
```bash
# View logs
eb logs --all

# Check health
eb health

# Restart application
eb restart
```

### SSL/HTTPS Setup
1. Go to EB Console → Configuration → Load Balancer
2. Add listener on port 443
3. Upload SSL certificate or use AWS Certificate Manager
4. Redirect HTTP to HTTPS

---

## Environment Variable Reference

| Variable | Example | Required | Notes |
|----------|---------|----------|-------|
| `RDS_HOSTNAME` | `mydb.xyz.rds.amazonaws.com` | Yes | Auto-set by EB if using EB RDS |
| `RDS_PORT` | `5432` | Yes | Auto-set by EB |
| `RDS_USERNAME` | `postgres` | Yes | Auto-set by EB |
| `RDS_PASSWORD` | `SecurePass123` | Yes | Auto-set by EB |
| `RDS_DB_NAME` | `ella_rises` | Yes | Auto-set by EB |
| `DB_SSL` | `true` | Yes | Required for RDS SSL |
| `MAIL_HOST` | `email-smtp.us-east-1.amazonaws.com` | Yes | SES SMTP endpoint |
| `MAIL_PORT` | `587` | Yes | TLS port |
| `MAIL_USER` | `AKIAIOSFODNN7EXAMPLE` | Yes | SES SMTP username |
| `MAIL_PASS` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | Yes | SES SMTP password |
| `MAIL_FROM` | `"Ella Rises <noreply@ellarises.org>"` | Yes | Verified SES email |
| `MAIL_TO` | `contact@ellarises.org` | Yes | Contact form recipient |
| `SESSION_SECRET` | `random-secret-key` | Yes | Session encryption key |
| `NODE_ENV` | `production` | Recommended | Enables production mode |

---

## Cost Optimization

- Use smallest RDS instance for development (db.t3.micro)
- Enable auto-scaling for EB environment
- Use SES sandbox mode for development (free)
- Monitor AWS costs regularly
- Set up billing alerts

---

## Security Best Practices

1. **Never commit .env file to git**
2. Use strong passwords for RDS
3. Restrict RDS security group to EB instances only
4. Enable RDS encryption at rest
5. Use HTTPS in production
6. Rotate SES credentials periodically
7. Enable EB managed updates
8. Regular security patches

---

## Support Resources

- [AWS Elastic Beanstalk Documentation](https://docs.aws.amazon.com/elasticbeanstalk/)
- [Amazon SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
