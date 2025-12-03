# Ella Rises - Deployment Package v3

**Version:** 3.0
**Date:** December 3, 2025
**Status:** Production Ready ✅

---

## 🚀 What's New in v3

### ✅ Database Connection Fixes
- Added connection pool configuration
- Added startup connection test with detailed logging
- Fixed SSL configuration for AWS RDS (auto-enables in production)
- Added connection health checks

### ✅ Environment Variable Improvements
- Fixed dotenv to only load in development
- Removed merge conflicts from .env.example
- Updated .ebignore to exclude unnecessary files

### ✅ Export Functionality (Bonus Features)
- 12 new export routes (6 CSV + 6 PDF)
- Admin-only access with proper authentication
- Export buttons added to all admin views

### ✅ Error Handling
- Custom 404 and 500 error pages
- Graceful error handling throughout

### ✅ Accessibility (WCAG 2.1 AA)
- Full accessibility compliance
- Screen reader support
- Keyboard navigation
- Color contrast ratios verified

### ✅ Quality Assurance
- 15 comprehensive test cases documented
- 15 automated tests executed (100% pass rate)

---

## 📦 Package Contents

This zip file contains everything needed for AWS Elastic Beanstalk deployment:

```
ella-rises-v3.zip
├── app.js                          # Main application (with DB connection test)
├── package.json                    # Dependencies
├── package-lock.json               # Locked versions
├── database-setup-new.sql          # Database schema
├── import-csv-data.js              # CSV data import script
├── public/                         # Static assets
│   ├── css/
│   ├── js/
│   └── images/
├── views/                          # EJS templates
│   ├── partials/
│   ├── admin/
│   ├── events/
│   ├── user/
│   ├── 404.ejs                    # Custom 404 page
│   ├── 500.ejs                    # Custom 500 page
│   └── [all other views]
└── [routes, middleware, etc.]
```

**Size:** ~5-10 MB (without node_modules)

---

## 🔧 Required Environment Variables

Set these in **Elastic Beanstalk Console → Configuration → Software → Environment Properties:**

### Database (RDS)
```bash
RDS_HOSTNAME=your-db.xyz.rds.amazonaws.com
RDS_PORT=5432
RDS_USERNAME=postgres
RDS_PASSWORD=your-secure-password
RDS_DB_NAME=ella_rises
DB_SSL=true
```

### Email (Amazon SES)
```bash
MAIL_HOST=email-smtp.us-east-1.amazonaws.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-ses-smtp-username
MAIL_PASS=your-ses-smtp-password
MAIL_FROM="Ella Rises <noreply@ellarises.org>"
MAIL_TO=jr.dishman3@gmail.com
```

### Application
```bash
SESSION_SECRET=your-random-secret-here
NODE_ENV=production
PORT=8080
```

**Generate SESSION_SECRET:**
```bash
openssl rand -base64 32
```

---

## 📋 Pre-Deployment Checklist

### 1. AWS RDS Setup
- [ ] PostgreSQL RDS instance created
- [ ] Security group allows EB access (port 5432)
- [ ] Database name: `ella_rises`
- [ ] Note the endpoint, username, password

### 2. Database Initialization
Connect to your RDS instance and run:
```bash
# Connect to RDS
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d ella_rises

# Run schema
\i database-setup-new.sql

# Verify
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM milestones;
```

Expected results:
- Users table: Should have admin user
- Events table: Can be empty initially
- Milestones table: Should have 10 milestone categories

### 3. Amazon SES Setup
- [ ] Sender email verified: noreply@ellarises.org
- [ ] Recipient email verified: jr.dishman3@gmail.com
- [ ] SMTP credentials generated
- [ ] Region matches MAIL_HOST (e.g., us-east-1)

**Note:** In sandbox mode, only verified emails can receive messages.

### 4. Elastic Beanstalk Configuration
- [ ] All environment variables set
- [ ] Node.js platform selected (latest version)
- [ ] Instance type appropriate (t3.micro minimum)
- [ ] Health check path: `/` (default)

---

## 🚀 Deployment Steps

### Method 1: EB CLI (Recommended)
```bash
# 1. Install EB CLI
pip install awsebcli --upgrade

# 2. Initialize (if not done)
eb init -r us-east-1 -p "Node.js 18"

# 3. Create environment (first time only)
eb create ella-rises-prod

# 4. Deploy
eb deploy

# 5. Check status
eb status
eb health
eb logs
```

### Method 2: Console Upload
1. Go to Elastic Beanstalk Console
2. Click "Upload and deploy"
3. Choose `ella-rises-v3.zip`
4. Click "Deploy"
5. Wait for deployment (5-10 minutes)

---

## ✅ Post-Deployment Verification

### 1. Check Application Status
```bash
# Using EB CLI
eb status
eb health

# Or visit EB Console
# Should show "Green" health status
```

### 2. Verify Database Connection
Check logs for connection message:
```bash
eb logs | grep "Database"
```

Expected output:
```
✅ Database connected successfully
   Host: your-rds-endpoint.rds.amazonaws.com
   Database: ella_rises
```

If you see errors:
```
❌ Database connection failed:
   Error: [error details]
```
- Check RDS security group
- Verify environment variables
- Ensure RDS is accessible from EB

### 3. Test Critical Routes

**Home Page:**
```bash
curl https://your-app.elasticbeanstalk.com/
# Should return 200 OK
```

**Events Page:**
```bash
curl https://your-app.elasticbeanstalk.com/events
# Should return 200 OK with events list
```

**Login Page:**
```bash
curl https://your-app.elasticbeanstalk.com/login
# Should return 200 OK
```

**404 Page:**
```bash
curl https://your-app.elasticbeanstalk.com/nonexistent
# Should return 404 with custom page
```

### 4. Test Admin Access
1. Navigate to `/login`
2. Use credentials from database
3. Should redirect to `/admin/dashboard`
4. Verify admin functions work

### 5. Test Export Functions
1. Login as admin
2. Go to `/admin/participants`
3. Click "Export CSV" - should download
4. Click "Export PDF" - should download

---

## 🐛 Troubleshooting

### Database Connection Failed

**Error:** `Database connection failed: connect ETIMEDOUT`

**Solutions:**
1. Check RDS security group:
   - Inbound rule: PostgreSQL (5432)
   - Source: EB security group or VPC CIDR
2. Verify environment variables:
   ```bash
   eb printenv | grep RDS
   ```
3. Check RDS status in AWS Console
4. Ensure `DB_SSL=true` for RDS connections

---

**Error:** `Database connection failed: password authentication failed`

**Solutions:**
1. Verify `RDS_PASSWORD` in EB environment variables
2. Check `RDS_USERNAME` matches RDS user
3. Reset RDS password if needed

---

### Application Not Starting

**Error:** `Application deployment failed`

**Solutions:**
1. Check EB logs:
   ```bash
   eb logs --all
   ```
2. Look for Node.js errors
3. Verify `package.json` has start script:
   ```json
   "scripts": {
     "start": "node app.js"
   }
   ```

---

### Email Not Sending

**Error:** `Email sending failed` in logs

**Solutions:**
1. Verify SES emails in AWS Console
2. Check SMTP credentials correct
3. Ensure region matches:
   - MAIL_HOST: `email-smtp.us-east-1.amazonaws.com`
4. In sandbox: verify recipient emails
5. Check EB logs for email errors

---

### 404 for All Routes

**Error:** All pages return 404

**Solutions:**
1. Check EB environment variables set
2. Verify application started:
   ```bash
   eb logs | grep "Server running"
   ```
3. Check health check passes
4. Ensure PORT=8080 in environment variables

---

## 📊 What to Expect

### Startup Messages
When the application starts successfully, you should see:
```
Server running on http://localhost:8080
Press Ctrl+C to stop
✅ Database connected successfully
   Host: your-rds-endpoint.rds.amazonaws.com
   Database: ella_rises
```

### Health Checks
- EB performs health checks every 30 seconds
- Checks: GET / (home page)
- Timeout: 5 seconds
- Unhealthy threshold: 5 failed checks

### Performance
- First load: ~2-3 seconds (cold start)
- Subsequent loads: < 1 second
- Database queries: < 500ms average

---

## 🔒 Security Notes

### What's Protected
- ✅ Admin routes require authentication
- ✅ Export functions require admin role
- ✅ Passwords hashed with bcrypt
- ✅ Sessions encrypted
- ✅ SQL injection protected (Knex parameterized queries)
- ✅ XSS protected (EJS auto-escaping)

### Production Checklist
- [ ] SESSION_SECRET is strong (32+ characters)
- [ ] RDS password is strong
- [ ] SES credentials secured
- [ ] NODE_ENV=production set
- [ ] Error details hidden from users
- [ ] HTTPS configured (EB certificate or custom)

---

## 📚 Additional Documentation

- **AWS Setup:** `AWS-DEPLOYMENT-GUIDE.md` (detailed SES setup)
- **Deployment:** `DEPLOYMENT-CHECKLIST.md` (complete checklist)
- **Testing:** `QA-TEST-PLAN.md` (15 test cases)
- **Results:** `QA-TEST-RESULTS.md` (test execution results)

---

## 🎯 Quick Reference

### Environment Variables Summary
| Variable | Example | Required | Notes |
|----------|---------|----------|-------|
| RDS_HOSTNAME | `mydb.rds.amazonaws.com` | Yes | From RDS endpoint |
| RDS_PORT | `5432` | Yes | Usually 5432 |
| RDS_USERNAME | `postgres` | Yes | Your RDS user |
| RDS_PASSWORD | `SecurePass123!` | Yes | Strong password |
| RDS_DB_NAME | `ella_rises` | Yes | Database name |
| DB_SSL | `true` | Yes | Required for RDS |
| MAIL_HOST | `email-smtp.us-east-1.amazonaws.com` | Yes | SES SMTP endpoint |
| MAIL_PORT | `587` | Yes | TLS port |
| MAIL_USER | `AKIAIOSFODNN7EXAMPLE` | Yes | SES SMTP username |
| MAIL_PASS | `wJalrXUtnFEMI...` | Yes | SES SMTP password |
| MAIL_FROM | `"Ella Rises <noreply@ellarises.org>"` | Yes | Verified email |
| MAIL_TO | `jr.dishman3@gmail.com` | Yes | Recipient email |
| SESSION_SECRET | `random-32-char-string` | Yes | For session encryption |
| NODE_ENV | `production` | Yes | Disables dotenv |
| PORT | `8080` | Recommended | EB uses 8080 |

### Test Credentials
After database setup, you'll have:
- **Admin:** Check database-setup-new.sql for admin user email
- **Password:** `admin123` (hashed in database)

---

## ✅ Deployment Success Indicators

Your deployment is successful when:
1. ✅ EB health status is "Green"
2. ✅ Logs show "Database connected successfully"
3. ✅ Logs show "Server running on http://localhost:8080"
4. ✅ Home page loads without errors
5. ✅ Events page shows events (or empty state)
6. ✅ Login page accessible
7. ✅ Admin login works
8. ✅ No error messages in logs

---

## 🎉 Next Steps After Deployment

1. **Custom Domain (Optional)**
   - Configure Route 53 or your DNS
   - Point to EB environment URL
   - Configure EB to use custom domain

2. **HTTPS Certificate**
   - Use AWS Certificate Manager (free)
   - Or upload your own certificate
   - Configure EB load balancer for HTTPS

3. **SES Production Access**
   - Request production access if needed
   - Allows sending to any email address
   - Required for real users

4. **Monitoring**
   - Enable CloudWatch logs
   - Set up alarms for errors
   - Monitor EB health dashboard

5. **Backups**
   - Configure RDS automated backups
   - Take manual snapshots before changes
   - Test restore procedure

---

## 📞 Support

If you encounter issues:
1. Check EB logs: `eb logs --all`
2. Review troubleshooting section above
3. Verify all environment variables set
4. Check RDS connectivity from EB
5. Review AWS CloudWatch logs

**Common Resources:**
- AWS EB Documentation: https://docs.aws.amazon.com/elasticbeanstalk/
- AWS RDS Documentation: https://docs.aws.amazon.com/rds/
- AWS SES Documentation: https://docs.aws.amazon.com/ses/

---

## 📝 Version History

### v3.0 (Current) - December 3, 2025
- Fixed database connection for EB deployment
- Added connection testing and error logging
- Fixed SSL configuration for RDS
- Added CSV/PDF export functionality
- Added custom 404/500 error pages
- Added WCAG 2.1 AA accessibility
- Comprehensive QA testing completed

---

**Package:** `ella-rises-v3.zip`
**Ready for:** AWS Elastic Beanstalk Production Deployment
**Status:** ✅ PRODUCTION READY
