# Elastic Beanstalk Deployment Checklist

## ✅ Issues Fixed

### 1. Merge Conflicts Resolved
- ✅ Fixed Git merge conflicts in `.env.example`
- ✅ Updated to use Amazon SES configuration

### 2. .ebignore Updated
- ✅ Added `.env.example` to exclusion list
- ✅ Added QA test files to exclusion list

### 3. Environment Variable Loading Fixed
- ✅ Modified `app.js` to only load dotenv in development
- ✅ Production will use EB environment variables

---

## 📦 What SHOULD Be in the Deployment Zip

### ✅ Include These:
```
app.js                    # Main application file
package.json              # Dependencies list
package-lock.json         # Locked dependency versions
config/                   # Database configuration
  └── database.js
middleware/               # Authentication middleware
  └── auth.js
routes/                   # All route files
  ├── auth.js
  ├── contacts.js
  ├── dashboard.js
  ├── events.js
  └── goals.js
views/                    # All EJS templates
  ├── partials/
  ├── admin/
  ├── events/
  ├── user/
  └── *.ejs files
public/                   # Static assets
  ├── css/
  ├── js/
  └── images/
database-setup-new.sql    # Database schema (for manual setup)
import-csv-data.js        # CSV import script (if needed)
```

### ❌ Exclude These (via .ebignore):
```
node_modules/             # Will be installed by EB
.env                      # Local environment file
.env.example              # Template file (not needed)
.git/                     # Git repository
*.log                     # Log files
.DS_Store                 # Mac files
Database Information/     # Sensitive database info
.aws/                     # AWS credentials
.claude/                  # Claude Code config
.cache/                   # Cache files
.npm/                     # npm cache
.config/                  # Config cache
*.md                      # Documentation files
.gitignore                # Git config
.ebextensions/            # EB extensions (if any)
.elasticbeanstalk/        # EB config (managed separately)
QA-TEST-PLAN.md           # Test documentation
QA-TEST-RESULTS.md        # Test results
```

---

## 🔧 Environment Variables to Set in EB Console

Navigate to: **Elastic Beanstalk Console → Your Environment → Configuration → Software → Environment Properties**

### Required Variables:

#### Database (from EB RDS or separate RDS):
```bash
RDS_HOSTNAME=your-rds-endpoint.region.rds.amazonaws.com
RDS_PORT=5432
RDS_USERNAME=postgres
RDS_PASSWORD=your-secure-password
RDS_DB_NAME=ella_rises
DB_SSL=true
```

#### Email (Amazon SES):
```bash
MAIL_HOST=email-smtp.us-east-1.amazonaws.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-ses-smtp-username
MAIL_PASS=your-ses-smtp-password
MAIL_FROM="Ella Rises <noreply@ellarises.org>"
MAIL_TO=jr.dishman3@gmail.com
```

#### Session & Application:
```bash
SESSION_SECRET=generate-with-openssl-rand-base64-32
NODE_ENV=production
PORT=8080
```

---

## 📋 Pre-Deployment Checklist

### 1. Code Preparation
- [x] Merge conflicts resolved in all files
- [x] `.ebignore` properly configured
- [x] `dotenv` only loads in development
- [ ] All sensitive data removed from code
- [ ] Database connection uses RDS_ environment variables

### 2. Database Setup
- [ ] RDS PostgreSQL instance created
- [ ] Security groups configured (allow EB access)
- [ ] Database schema loaded (`database-setup-new.sql`)
- [ ] CSV data imported (if needed)
- [ ] Test users created

### 3. AWS Configuration
- [ ] SES sender email verified
- [ ] SES recipient email verified (if sandbox mode)
- [ ] SES SMTP credentials generated
- [ ] All environment variables set in EB Console

### 4. Application Testing
- [ ] Test locally with production-like settings
- [ ] Verify database connection works
- [ ] Test email sending
- [ ] Check all routes load
- [ ] Verify admin authentication works

### 5. Deployment Package
- [ ] Create zip from correct directory
- [ ] Verify zip doesn't contain excluded files
- [ ] Check zip size (should be < 10MB without node_modules)

---

## 🚀 How to Create Deployment Zip

### Option 1: Using EB CLI (Recommended)
```bash
cd /root/intex
eb deploy
```
The EB CLI automatically respects `.ebignore` and creates the zip for you.

### Option 2: Manual Zip Creation
```bash
cd /root/intex
zip -r ella-rises-deploy.zip . -x@.ebignore
```

### Option 3: Explicit Exclusions
```bash
cd /root/intex
zip -r ella-rises-deploy.zip . \
  -x "node_modules/*" \
  -x ".env" \
  -x ".env.example" \
  -x ".git/*" \
  -x "*.log" \
  -x ".DS_Store" \
  -x "Database Information/*" \
  -x ".aws/*" \
  -x ".claude/*" \
  -x ".cache/*" \
  -x ".npm/*" \
  -x ".config/*" \
  -x "*.md" \
  -x ".gitignore" \
  -x ".ebextensions/*" \
  -x ".elasticbeanstalk/*"
```

---

## ⚠️ Common Deployment Issues & Solutions

### Issue 1: "Cannot find module 'dotenv'"
**Cause:** dotenv is a devDependency but app.js requires it
**Solution:** ✅ FIXED - Now only loads in development mode

### Issue 2: "Database connection failed"
**Cause:** Environment variables not set or incorrect
**Solution:**
- Verify all RDS_* variables in EB Console
- Check security group allows EB → RDS connection
- Verify DB_SSL=true for RDS connections

### Issue 3: "Email sending failed"
**Cause:** SES not configured or emails not verified
**Solution:**
- Verify sender email in SES Console
- If sandbox mode: verify recipient emails
- Check SMTP credentials are correct
- Verify region matches (email-smtp.us-east-1.amazonaws.com)

### Issue 4: "Session secret not set"
**Cause:** SESSION_SECRET environment variable missing
**Solution:**
```bash
# Generate secure secret:
openssl rand -base64 32
# Add to EB environment variables
```

### Issue 5: "Application timeout"
**Cause:** Database connection hanging
**Solution:**
- Check RDS security group rules
- Verify RDS_HOSTNAME is correct
- Check DB_SSL setting matches RDS configuration

### Issue 6: "Merge conflict markers in files"
**Cause:** Git conflicts not resolved
**Solution:** ✅ FIXED - Resolved .env.example conflicts

---

## 🧪 Post-Deployment Testing

After deployment, test these critical paths:

### 1. Basic Connectivity
```bash
curl https://your-app.elasticbeanstalk.com/
# Should return 200 OK
```

### 2. Database Connection
- Visit home page
- Should load without errors
- Check EB logs: `eb logs` for any database errors

### 3. Authentication
- Navigate to /login
- Login with admin credentials
- Verify redirect to /admin/dashboard

### 4. Admin Functions
- Access /admin/participants
- Verify data loads
- Test CSV export
- Test PDF export

### 5. Email (if SES configured)
- Submit contact form
- Check recipient email
- Test event registration email

---

## 📊 Deployment Package Size

**Expected sizes:**
- With `.ebignore` properly configured: **~5-10 MB**
- Without node_modules: **~5 MB**
- node_modules alone: **~50-100 MB** (installed by EB)

**Check your zip:**
```bash
ls -lh ella-rises-deploy.zip
unzip -l ella-rises-deploy.zip | grep -E "(node_modules|.env)" | head
```

If you see node_modules or .env files, your `.ebignore` isn't working!

---

## 🔒 Security Notes

1. **Never include in deployment:**
   - `.env` file with actual credentials
   - `Database Information/` folder
   - `.aws/` credentials folder
   - Any files with passwords or API keys

2. **Always use EB environment variables for:**
   - Database passwords
   - Session secrets
   - SMTP credentials
   - Any sensitive configuration

3. **Set NODE_ENV=production:**
   - Disables dotenv loading
   - Enables production optimizations
   - Hides error stack traces from users

---

## 📚 Additional Resources

- **AWS Deployment Guide:** See `AWS-DEPLOYMENT-GUIDE.md` for complete setup
- **Database Setup:** Use `database-setup-new.sql` for schema
- **Test Plan:** See `QA-TEST-PLAN.md` for testing procedures
- **Test Results:** See `QA-TEST-RESULTS.md` for validation

---

## ✅ Final Verification

Before deploying, verify:
```bash
# 1. Check for merge conflicts
git status
git diff

# 2. Check .ebignore is working
zip -r test.zip . -x@.ebignore
unzip -l test.zip | grep -E "(node_modules|\.env)" | wc -l
# Should return 0

# 3. Test app locally with production settings
NODE_ENV=production node app.js
# Should NOT load .env file, should warn about missing variables

# 4. Verify all dependencies listed
cat package.json | grep -A 20 "dependencies"
```

---

## 🎯 Quick Deploy Commands

```bash
# 1. Ensure you're in the correct directory
cd /root/intex

# 2. If using EB CLI:
eb deploy

# 3. If manual upload:
zip -r deploy.zip . -x@.ebignore
# Upload deploy.zip via EB Console

# 4. Check deployment status:
eb status
eb health
eb logs
```

---

## Summary

**The key issues were:**
1. ✅ `.env.example` had merge conflicts → **FIXED**
2. ✅ `.env.example` was included in zip → **FIXED** (added to .ebignore)
3. ✅ `dotenv` loaded in production → **FIXED** (now development-only)

**Your deployment package should now:**
- ✅ Exclude all development files
- ✅ Work with EB environment variables
- ✅ Have no merge conflicts
- ✅ Be properly sized (~5-10 MB)

**Next steps:**
1. Set environment variables in EB Console
2. Deploy using `eb deploy` or upload zip
3. Run database setup script on RDS
4. Test application thoroughly
