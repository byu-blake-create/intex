# Diagnosing EB Authentication Issues

## Why Authentication Works Locally But Not on EB

### Most Common Issues (in order of likelihood):

## 1. RDS Database Empty or Not Set Up ⚠️

**Problem:** Your RDS database doesn't have any users yet.

**Check via EB SSH:**
```bash
# SSH into your EB instance
eb ssh

# Connect to RDS
psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d $RDS_DB_NAME

# Check if users table exists and has data
SELECT COUNT(*) FROM users;
SELECT email, LEFT(password_hash, 30) FROM users LIMIT 5;
```

**If empty, you need to:**
1. Run `database-setup.sql` on RDS
2. Import CSV data with the import script pointing to RDS

---

## 2. RDS Database Has Plaintext Passwords

**Problem:** Data was imported to RDS without hashing passwords.

**Check:**
```sql
-- Connect to RDS
psql -h your-rds-endpoint -U postgres -d ella_rises

-- Check password format
SELECT
  email,
  LEFT(password_hash, 20) as sample,
  LENGTH(password_hash) as len,
  CASE
    WHEN password_hash LIKE '$2a$%' OR password_hash LIKE '$2b$%'
    THEN 'HASHED ✅'
    ELSE 'PLAINTEXT ❌'
  END as status
FROM users
LIMIT 10;
```

**Expected (Good):**
```
email                     | sample               | len | status
--------------------------+----------------------+-----+------------
user@example.com          | $2a$10$TbsWcoitH0z  | 60  | HASHED ✅
```

**Bad:**
```
email                     | sample               | len | status
--------------------------+----------------------+-----+------------
user@example.com          | participant123       | 14  | PLAINTEXT ❌
```

**If plaintext, fix with:**
```bash
# Point import script to RDS
export DB_HOST=your-rds-endpoint.rds.amazonaws.com
export DB_USER=postgres
export DB_PASSWORD=your-rds-password
export DB_NAME=ella_rises
export DB_PORT=5432

# Import with hashing
node import-csv-data.js
```

---

## 3. Database Connection Not Working

**Problem:** EB can't connect to RDS at all.

**Check EB Logs:**
```bash
eb logs | grep -i "database"
```

**Look for:**
```
❌ Database connection failed:
   Error: connect ETIMEDOUT
```

**OR:**
```
✅ Database connected successfully
   Host: your-rds-endpoint.rds.amazonaws.com
   Database: ella_rises
```

**If connection fails:**

### Check Security Group
RDS security group must allow connections from EB:

1. Go to: **RDS Console → Your Instance → Connectivity & Security**
2. Click on the security group
3. **Inbound Rules** should have:
   - Type: PostgreSQL
   - Port: 5432
   - Source: EB security group OR VPC CIDR

### Check Environment Variables
```bash
eb printenv | grep -E "(RDS|DB)"
```

**Should show:**
```
RDS_HOSTNAME=your-db.xyz.rds.amazonaws.com
RDS_PORT=5432
RDS_USERNAME=postgres
RDS_PASSWORD=***
RDS_DB_NAME=ella_rises
DB_SSL=true
```

**If missing, set them:**
```bash
eb setenv RDS_HOSTNAME=your-db.xyz.rds.amazonaws.com \
  RDS_PORT=5432 \
  RDS_USERNAME=postgres \
  RDS_PASSWORD=your-password \
  RDS_DB_NAME=ella_rises \
  DB_SSL=true
```

---

## 4. bcrypt Module Not Installed on EB

**Problem:** bcryptjs not in dependencies (unlikely but possible).

**Check package.json:**
```bash
grep bcrypt package.json
```

**Should show:**
```json
"bcryptjs": "^2.4.3"
```

**If missing, add it:**
```bash
npm install --save bcryptjs
git add package.json package-lock.json
git commit -m "Add bcryptjs dependency"
git push
eb deploy
```

---

## 5. Session Storage Issues

**Problem:** Sessions not persisting on EB.

**Check:**
- Is `SESSION_SECRET` set in EB environment variables?
```bash
eb printenv | grep SESSION_SECRET
```

- Are sessions working at all?
```bash
eb logs | grep -i "session"
```

---

## 6. Different Database Data

**Problem:** Local DB has hashed passwords, RDS has different data.

**Compare:**

**Local:**
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d ella_rises \
  -c "SELECT COUNT(*) as local_users FROM users;"
```

**RDS:**
```bash
PGPASSWORD=your-rds-pass psql -h your-rds-endpoint -U postgres -d ella_rises \
  -c "SELECT COUNT(*) as rds_users FROM users;"
```

**If counts are different:**
- Local has 1,176 users (with hashed passwords)
- RDS has 0 users (or different number)
- **Solution:** Import data to RDS

---

## Complete Diagnostic Script

Run this to check everything:

```bash
#!/bin/bash
echo "=== EB Authentication Diagnostics ==="

echo -e "\n1. Checking EB environment variables..."
eb printenv | grep -E "(RDS|DB|SESSION)"

echo -e "\n2. Checking EB logs for database connection..."
eb logs | grep -i "database" | tail -10

echo -e "\n3. Checking EB logs for authentication errors..."
eb logs | grep -i "login" | tail -10

echo -e "\n4. Testing EB application health..."
eb health

echo -e "\n5. Checking package.json for bcryptjs..."
grep bcrypt package.json

echo -e "\n6. Checking local database..."
PGPASSWORD=postgres psql -h localhost -U postgres -d ella_rises \
  -c "SELECT COUNT(*) as local_users,
      SUM(CASE WHEN password_hash LIKE '\$2a\$%' THEN 1 ELSE 0 END) as hashed
      FROM users;"

echo -e "\n=== Diagnostics Complete ==="
```

---

## Most Likely Solution

Based on your symptoms, **99% chance it's one of these:**

### Scenario A: RDS Database Empty
```bash
# 1. Connect to RDS from your local machine
psql -h your-rds-endpoint.rds.amazonaws.com \
     -U postgres \
     -d ella_rises

# 2. Run schema
\i database-setup.sql

# 3. Verify
SELECT COUNT(*) FROM users;
# Should show users with hashed passwords
```

### Scenario B: RDS Has Data But Wrong Passwords
```bash
# 1. Check RDS passwords
psql -h your-rds-endpoint.rds.amazonaws.com \
     -U postgres \
     -d ella_rises \
     -c "SELECT LEFT(password_hash, 20), LENGTH(password_hash) FROM users LIMIT 5;"

# If plaintext, re-import with hashing:

# 2. Point to RDS
export DB_HOST=your-rds-endpoint.rds.amazonaws.com
export DB_PASSWORD=your-rds-password

# 3. Delete plaintext users (if any)
psql -h $DB_HOST -U postgres -d ella_rises \
  -c "DELETE FROM users WHERE password_hash NOT LIKE '\$2a\$%';"

# 4. Import with hashing
node import-csv-data.js
```

### Scenario C: RDS Security Group
```bash
# Fix security group to allow EB → RDS connections

# 1. Get EB security group ID
aws elasticbeanstalk describe-environment-resources \
  --environment-name your-env-name \
  --query "EnvironmentResources.Instances[0].Id"

# 2. Add inbound rule to RDS security group:
# Type: PostgreSQL (5432)
# Source: EB security group ID
```

---

## Quick Test

Try this to see the exact error:

```bash
# 1. SSH into EB
eb ssh

# 2. Check if bcryptjs exists
node -e "console.log(require('bcryptjs'))"

# 3. Test database connection
node -e "
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DB_NAME,
    port: process.env.RDS_PORT,
    ssl: { rejectUnauthorized: false }
  }
});
knex.raw('SELECT COUNT(*) FROM users').then(r => console.log('Users:', r.rows)).catch(e => console.error('Error:', e.message));
"

# 4. Test password hash
node -e "
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DB_NAME,
    port: process.env.RDS_PORT,
    ssl: { rejectUnauthorized: false }
  }
});
knex('users').first().then(u => console.log('First user password:', u.password_hash.substring(0, 20))).catch(e => console.error(e.message));
"
```

---

## What to Look For

When you run diagnostics, you'll see one of these:

### ✅ Good (Should Work)
```
Database connected successfully
Host: your-rds.rds.amazonaws.com
Database: ella_rises

Users: 1176, Hashed: 1176
Password sample: $2a$10$TbsWcoitH0z...
```

### ❌ Bad - No Connection
```
Database connection failed:
Error: connect ETIMEDOUT
```
→ **Fix:** Security group

### ❌ Bad - No Data
```
Database connected successfully
Users: 0
```
→ **Fix:** Run database-setup.sql on RDS

### ❌ Bad - Plaintext Passwords
```
Database connected successfully
Users: 1176, Hashed: 0
Password sample: participant123
```
→ **Fix:** Re-import with hashing

---

## Need Me to Help Diagnose?

Tell me:
1. What error do you see when trying to log in on EB?
2. What do the EB logs show? (`eb logs | grep -i database`)
3. Can you connect to your RDS database directly?
4. Does your RDS database have any users in it?

I can walk you through the exact fix once we identify the issue!
