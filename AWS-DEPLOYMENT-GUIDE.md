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

## Step 5: Amazon SES Setup (CRITICAL FOR EMAIL FUNCTIONALITY)

Amazon SES (Simple Email Service) handles ALL email sending for your application:
- **Contact form submissions** (sends to MAIL_TO address)
- **Event registration confirmations** (sends to users who register for events)

### Understanding SES Sandbox Mode

**IMPORTANT:** SES starts in **Sandbox Mode** by default.

**Sandbox Mode Restrictions:**
- ✅ FREE to use (200 emails/day limit)
- ✅ Perfect for testing and development
- ❌ Can ONLY send emails **TO** verified email addresses
- ❌ Can ONLY send emails **FROM** verified email addresses

**What This Means:**
- Contact form will ONLY work if recipient email is verified in SES
- Event confirmation emails will ONLY work if the user's email is verified in SES
- **Good news:** The app handles email failures gracefully - if an email can't be sent, the site still works normally (users just don't get the email)

**Production Mode:**
- ✅ Can send to ANY email address (no verification needed)
- ✅ Higher sending limits
- ⏱️ Requires AWS approval (24-48 hours)

---

### Step-by-Step SES Configuration

### 1. Create SMTP Credentials (Required)

**Navigate to SES Console:**
1. Go to AWS Console → Services → Amazon SES
2. Make sure you're in the correct region (e.g., us-east-1)
3. In left sidebar, click **"SMTP Settings"**

**Create SMTP Credentials:**
1. Click **"Create My SMTP Credentials"** button
2. You'll see the IAM username (e.g., `ses-smtp-user.20231215-123456`)
3. Click **"Create"**
4. **CRITICAL:** Download or copy the credentials NOW:
   - **SMTP Username:** (looks like `AKIAIOSFODNN7EXAMPLE`)
   - **SMTP Password:** (looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)
   - **You cannot view these again!** Save them securely.

**Note the SMTP Endpoint:**
- Format: `email-smtp.{region}.amazonaws.com`
- Example for us-east-1: `email-smtp.us-east-1.amazonaws.com`
- Example for us-west-2: `email-smtp.us-west-2.amazonaws.com`

---

### 2. Verify Email Addresses (Required for Sandbox Mode)

**For Testing/Sandbox Mode, verify these emails:**

#### A. Verify Sender Email (MAIL_FROM)
This is the email that appears in the "From" field.

1. Go to **SES Console → Verified Identities**
2. Click **"Create Identity"**
3. Select **"Email address"**
4. Enter your sender email:
   - For testing: Use any email you have access to (e.g., `your.email@gmail.com`)
   - For production: Use `noreply@ellarises.org` or `contact@ellarises.org`
5. Click **"Create Identity"**
6. **Check your inbox** for verification email from AWS
7. Click the verification link in the email
8. Wait for status to show **"Verified"** (refresh the page)

#### B. Verify Recipient Email (MAIL_TO)
This is where contact form submissions go.

1. Go to **SES Console → Verified Identities**
2. Click **"Create Identity"**
3. Select **"Email address"**
4. Enter: `jr.dishman3@gmail.com` (or your desired recipient)
5. Click **"Create Identity"**
6. **Check that inbox** for verification email from AWS
7. Click the verification link
8. Wait for status to show **"Verified"**

#### C. (Optional) Verify Test User Emails
If you want to test event registration emails in sandbox mode:

1. Create a test user account in your app with a verified email
2. Verify that email address in SES (same process as above)
3. Register for events with that account → you'll receive confirmation emails!

**Example:**
- Verify `jr.dishman3@gmail.com` in SES
- Create user account in app with email `jr.dishman3@gmail.com`
- Register for an event → receive confirmation email ✅

---

### 3. Configure Environment Variables

Add these to **Elastic Beanstalk → Configuration → Software → Environment Properties**:

```
MAIL_HOST=email-smtp.us-east-1.amazonaws.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=<your-ses-smtp-username>
MAIL_PASS=<your-ses-smtp-password>
MAIL_FROM=your.verified.email@example.com
MAIL_TO=jr.dishman3@gmail.com
```

**Replace:**
- `us-east-1` with your AWS region
- `<your-ses-smtp-username>` with the SMTP username from Step 1
- `<your-ses-smtp-password>` with the SMTP password from Step 1
- `your.verified.email@example.com` with the sender email you verified in Step 2A
- `jr.dishman3@gmail.com` with the recipient email you verified in Step 2B

---

### 4. Test Email Functionality (After Deployment)

#### Test Contact Form:
1. Navigate to: `https://your-app.elasticbeanstalk.com/contact`
2. Fill out the contact form
3. Submit
4. Check `jr.dishman3@gmail.com` inbox
5. ✅ You should receive the contact form message

#### Test Event Registration Emails:
1. Create a user account with email `jr.dishman3@gmail.com` (or another verified email)
2. Log in with that account
3. Register for an event
4. Check inbox
5. ✅ You should receive event confirmation email

**If emails don't send:**
- Check Elastic Beanstalk logs: `eb logs`
- Verify both sender and recipient emails are verified in SES
- Check SMTP credentials are correct
- Ensure you're using the correct region endpoint

---

### 5. Move to Production Mode (Optional - For Real Deployment)

**When to do this:**
- When you're ready to send emails to ANY user (not just verified addresses)
- For real production deployment

**How to Request Production Access:**

1. Go to **SES Console → Account Dashboard**
2. Look for **"Production Access"** section (shows "Sandbox" status)
3. Click **"Request Production Access"** or **"Edit Account Details"**
4. Fill out the request form:
   - **Mail type:** Transactional
   - **Website URL:** Your app URL
   - **Use case description:**
     ```
     Non-profit organization website for Ella Rises. We send:
     1. Contact form submissions to our admin team
     2. Event registration confirmations to users who sign up for events
     All emails are requested by users and are transactional in nature.
     ```
   - **Compliance:** Confirm you comply with AWS policies
5. Submit the request
6. **Wait 24-48 hours** for AWS review
7. You'll receive email notification when approved

**After Approval:**
- No code changes needed!
- Emails will now work for ANY recipient address
- Event confirmation emails will work for all users
- Higher sending limits (start at 200/day, can request increases)

---

### 6. Email Features Summary

**What emails does the app send?**

| Feature | Trigger | Sent To | Sent From |
|---------|---------|---------|-----------|
| Contact Form | User submits contact form | MAIL_TO (jr.dishman3@gmail.com) | MAIL_FROM |
| Event Registration | User registers for event | User's email address | MAIL_FROM |

**Sandbox Mode Behavior:**
- ✅ Contact form works (if MAIL_TO is verified)
- ⚠️ Event confirmations ONLY work for verified user emails
- ✅ Site functions normally even if emails fail
- ✅ Users can still register for events (just won't get email)

**Production Mode Behavior:**
- ✅ Contact form works for any recipient
- ✅ Event confirmations work for ALL users
- ✅ No email verification required

---

### Troubleshooting SES Issues

**Problem: "Email address not verified"**
- Solution: Verify both sender (MAIL_FROM) and recipient emails in SES Console

**Problem: "Invalid credentials"**
- Solution: Regenerate SMTP credentials in SES Console, update environment variables

**Problem: "Message rejected"**
- Solution: Check you're not exceeding sandbox limits (200 emails/day)

**Problem: Contact form works but event emails don't**
- Explanation: Event emails go to user's email address, which may not be verified in sandbox mode
- Solution: Either verify the user's email in SES, or request production access

**Problem: No errors but emails not arriving**
- Check spam/junk folder
- Verify correct region endpoint (email-smtp.us-east-1.amazonaws.com)
- Check EB logs for email sending attempts: `eb logs`

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
