# SCHEMA COMPATIBILITY ANALYSIS
## New Database Schema vs App.js Code

**Date:** December 3, 2025
**Schema File:** `new-database-setup.sql`
**Status:** ⚠️ PARTIAL COMPATIBILITY - Critical Issues Found

---

## EXECUTIVE SUMMARY

The app.js has been **PARTIALLY UPDATED** to work with the new hybrid schema (`new-database-setup.sql`), but there are **CRITICAL INCOMPATIBILITIES** remaining that will cause runtime errors in production:

### ✅ **Routes Already Updated (Working):**
- Login/Authentication ✅
- Event Registration ✅
- User Dashboard ✅
- Event Display ✅
- Programs ✅
- Donations ✅

### ❌ **Routes Still Using OLD Schema (Will Fail):**
- Admin Milestone Management (4 routes)
- CSV/PDF Export for Participants (2 routes)
- CSV/PDF Export for Events (2 routes)

**Total Affected Routes:** 8 routes will fail with "relation does not exist" errors

---

## NEW SCHEMA STRUCTURE

### Table Name Changes

| OLD Schema | NEW Schema | Status |
|------------|------------|--------|
| `users` | `participants` | ⚠️ Partially Updated |
| `event_templates` | `events` | ✅ Updated |
| `events` | `event_occurance` | ✅ Updated |
| `event_registrations` + `surveys` | `registration` (merged) | ✅ Updated |
| `milestones` + `participant_milestones` | `milestone` (merged) | ❌ NOT Updated |
| `donations` | `donations` | ✅ Same (FKs updated) |
| `programs` | `programs` | ✅ Same |
| `program_enrollments` | `program_enrollments` | ✅ Same |

### Column Name Changes (participants table)

| OLD Column | NEW Column | Status |
|------------|------------|--------|
| `email` | `participant_email` | ✅ Updated |
| `name` | `participant_first_name` + `participant_last_name` | ⚠️ Partially Updated |
| `password_hash` | `participant_password` | ✅ Updated |
| `role` | `participant_role` | ⚠️ Inconsistent Usage |
| `date_of_birth` | `participant_dob` | ✅ Updated |
| `phone` | `participant_phone` | ✅ Updated |
| `city` | `participant_city` | ✅ Updated |
| `state` | `participant_state` | ✅ Updated |
| `zip` | `participant_zip` | ✅ Updated |
| `school_or_employer` | `participant_school_or_employer` | ✅ Updated |
| `field_of_interest` | `participant_field_of_interest` | ✅ Updated |

### Column Name Changes (event_occurance table)

| OLD Column | NEW Column | Status |
|------------|------------|--------|
| `id` | `event_occurance_id` | ✅ Updated |
| `title` | ❌ REMOVED (now in `events` template) | ⚠️ Needs Handling |
| `start_time` | `event_date_time_start` | ✅ Updated |
| `end_time` | `event_date_time_end` | ✅ Updated |
| `event_template_id` | `event_name` (STRING FK) | ✅ Updated |

### Column Name Changes (donations table)

| OLD Column | NEW Column | Status |
|------------|------------|--------|
| `id` | `donation_id` | ⚠️ Needs Verification |
| `user_id` | `participant_id` | ⚠️ Needs Verification |
| `amount` | `donation_amount` | ⚠️ Needs Verification |

---

## CRITICAL ISSUES FOUND

### Issue 1: ❌ Milestone Routes Using OLD Schema

**File:** `app.js`
**Lines:** 2118-2189
**Severity:** 🔴 CRITICAL - Will cause runtime errors

**Problem:** Admin milestone management routes still query OLD table names that don't exist in NEW schema.

#### Affected Routes:

1. **GET /admin/milestones/user/:userId** (Line 2114-2145)
   ```javascript
   // ❌ BROKEN - uses OLD schema
   const user = await knex('users')  // Should be 'participants'
     .where('id', userId)
     .first();

   const userMilestones = await knex('participant_milestones')  // Table doesn't exist
     .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
     .where('participant_milestones.user_id', userId)
   ```

   **Fix Required:**
   - Change `knex('users')` → `knex('participants')`
   - Change `user.name` → `CONCAT(participant_first_name, ' ', participant_last_name)`
   - Rewrite JOIN logic for NEW schema:
     ```javascript
     const userMilestones = await knex('milestone')
       .where('participant_id', userId)
       .select('*')
       .orderBy('milestone_date', 'desc');
     ```

2. **POST /admin/milestones/create** (Line 2148-2163)
   ```javascript
   // ❌ BROKEN - uses OLD schema
   await knex('milestones').insert({  // Should be 'milestone' (singular)
     title,
     description,
     created_at: new Date(),
   });
   ```

   **Fix Required:**
   - Change `knex('milestones')` → `knex('milestone')`
   - Add `participant_id` (required in NEW schema)
   - Add `milestone_category`

3. **POST /admin/milestones/:id/edit** (Line 2166-2179)
   ```javascript
   // ❌ BROKEN - uses OLD schema
   await knex('milestones')  // Should be 'milestone'
     .where('id', req.params.id)
     .update({ title, description });
   ```

   **Fix Required:**
   - Change `knex('milestones')` → `knex('milestone')`
   - Update WHERE clause to use `milestone_id`

4. **POST /admin/milestones/:id/delete** (Line 2182-2189)
   ```javascript
   // ❌ BROKEN - uses OLD schema
   await knex('milestones').where('id', req.params.id).del();
   ```

   **Fix Required:**
   - Change `knex('milestones')` → `knex('milestone')`
   - Update WHERE clause to use `milestone_id`

---

### Issue 2: ❌ CSV/PDF Export Routes Using OLD Schema

**File:** `app.js`
**Lines:** 2347-2553
**Severity:** 🔴 CRITICAL - Export functionality completely broken

#### Affected Routes:

1. **GET /admin/participants/export/csv** (Line 2347-2383)
   ```javascript
   // ❌ BROKEN - queries 'users' table
   let query = knex('users').select('id', 'name', 'email', 'role', 'total_donations', 'login_count', 'created_at');
   ```

   **Fix Required:**
   ```javascript
   let query = knex('participants').select(
     'id',
     knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name"),
     'participant_email as email',
     'participant_role as role',
     'total_donations',
     'login_count',
     'created_at'
   );
   ```

   **Search filters need update:**
   ```javascript
   // OLD:
   .where('name', 'ilike', `%${search}%`)
   .orWhere('email', 'ilike', `%${search}%`);

   // NEW:
   .where('participant_first_name', 'ilike', `%${search}%`)
   .orWhere('participant_last_name', 'ilike', `%${search}%`)
   .orWhere('participant_email', 'ilike', `%${search}%`);
   ```

2. **GET /admin/participants/export/pdf** (Line 2386-2449)
   ```javascript
   // ❌ BROKEN - same issue as CSV export
   let query = knex('users').select('id', 'name', 'email', 'role', 'total_donations', 'login_count');
   ```

   **Fix Required:** Same as CSV export above

3. **GET /admin/events/export/csv** (Line 2455-2493)
   ```javascript
   // ⚠️ PARTIALLY BROKEN - queries 'events' but expects wrong structure
   let query = knex('events').select('*');

   // Uses columns that don't exist in event_occurance:
   const csvData = events.map(event => ({
     ID: event.id,              // ❌ Should be event_occurance_id
     Title: event.title,        // ❌ 'events' table doesn't have 'title' (only event_name)
     Start Time: event.start_time,  // ❌ Should be event_date_time_start
     End Time: event.end_time,      // ❌ Should be event_date_time_end
   }));
   ```

   **Fix Required:**
   ```javascript
   // If exporting event TEMPLATES:
   let query = knex('events').select('*');  // OK
   const csvData = events.map(event => ({
     'Event Name': event.event_name,
     'Type': event.event_type,
     'Description': event.event_description,
     'Recurrence': event.event_recurrence_pattern,
     'Default Capacity': event.event_default_capacity,
   }));

   // If exporting event OCCURRENCES:
   let query = knex('event_occurance')
     .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
     .select(
       'event_occurance.*',
       'events.event_name as name',
       'events.event_type as type'
     );

   const csvData = eventOccurrences.map(event => ({
     ID: event.event_occurance_id,
     'Event Name': event.name,
     'Start Time': new Date(event.event_date_time_start).toLocaleString(),
     'End Time': new Date(event.event_date_time_end).toLocaleString(),
     Location: event.event_location,
     Capacity: event.event_capacity,
   }));
   ```

4. **GET /admin/events/export/pdf** (Line 2496-2553)
   ```javascript
   // ❌ BROKEN - same issue as events CSV export
   let query = knex('events').select('*');
   // Uses event.title, event.start_time, etc. which don't exist
   ```

   **Fix Required:** Same as events CSV export above

---

### Issue 3: ⚠️ Inconsistent Column Reference

**File:** `app.js`
**Line:** 498
**Severity:** 🟡 MEDIUM - May cause redirect issues

**Problem:**
```javascript
// Line 490-495: Session stores 'role' (aliased from participant_role)
req.session.user = {
  id: user.id,
  name: `${user.participant_first_name} ${user.participant_last_name}`,
  email: user.participant_email,
  role: user.participant_role,  // ✅ Correct
};

// Line 498: Checks user.role instead of user.participant_role
if (user.role === 'admin') {  // ⚠️ Should be user.participant_role
  res.redirect('/admin/dashboard');
}
```

**Fix Required:**
```javascript
if (user.participant_role === 'admin') {
  res.redirect('/admin/dashboard');
} else {
  res.redirect('/user/dashboard');
}
```

---

### Issue 4: ⚠️ Donations Table Column Names

**File:** `app.js`
**Lines:** Multiple locations
**Severity:** 🟡 MEDIUM - Needs verification

**Potential Issues:**

The NEW schema uses:
- `donation_id` (not `id`)
- `participant_id` (not `user_id`)
- `donation_amount` (not `amount`)

**Locations to verify:**

1. Line 901: Insert donation
2. Line 1121: Sum total donations
3. Line 1264: Query user donations
4. Line 2203-2322: Donation management routes

**Action Required:** Verify these routes use correct column names from NEW schema.

---

## SCHEMA STRUCTURE COMPARISON

### OLD Schema (rds-bootstrap.sql)

```
users (id, email, name, password_hash, role, ...)
  └─ event_registrations (user_id FK)
  └─ surveys (user_id FK)
  └─ participant_milestones (user_id FK)
  └─ donations (user_id FK)
  └─ program_enrollments (user_id FK)

event_templates (id, name, type, ...)
  └─ events (event_template_id FK)

milestones (id, title, description, category)
  └─ participant_milestones (milestone_id FK)
```

### NEW Schema (new-database-setup.sql)

```
participants (id, participant_email, participant_first_name, participant_last_name, participant_password, participant_role, ...)
  └─ registration (participant_id FK) [includes survey fields]
  └─ milestone (participant_id FK) [includes milestone data directly]
  └─ donations (participant_id FK)
  └─ program_enrollments (user_id FK) [still uses 'user_id'!]

events (event_name PK [STRING], event_type, event_description, ...)
  └─ event_occurance (event_name FK)
      └─ registration (event_occurance_id FK)

attendance (attendance_id PK)
  └─ registration (attendance_id FK)
```

**Key Architectural Changes:**

1. **Merged Tables:**
   - `event_registrations` + `surveys` → `registration` (single table with survey fields)
   - `milestones` + `participant_milestones` → `milestone` (single table)

2. **Split Events:**
   - `events` now stores templates (with STRING primary key `event_name`)
   - `event_occurance` stores actual event instances

3. **Added Attendance Tracking:**
   - New `attendance` table for check-in/status

4. **Prefixed Columns:**
   - All `participants` columns prefixed with `participant_*`
   - All `event_occurance` columns prefixed with `event_*`
   - All `donation` columns prefixed with `donation_*`
   - All survey fields prefixed with `survey_*`

---

## ROUTES COMPATIBILITY MATRIX

| Route | Method | Table(s) Used | Status | Notes |
|-------|--------|---------------|--------|-------|
| `/login` | POST | `participants` | ✅ | Correctly updated |
| `/register` | POST | `participants` | ✅ | Correctly updated |
| `/events` | GET | `event_occurance` | ✅ | Correctly updated |
| `/events/:id` | GET | `event_occurance`, `registration` | ✅ | Correctly updated |
| `/events/:id/register` | POST | `event_occurance`, `registration` | ✅ | Correctly updated |
| `/programs` | GET | `programs` | ✅ | No changes needed |
| `/programs/:id/enroll` | POST | `program_enrollments` | ✅ | No changes needed |
| `/donate` | POST | `donations` | ⚠️ | Verify column names |
| `/user/dashboard` | GET | `registration`, `milestone` | ✅ | Correctly updated |
| `/user/events` | GET | `registration` | ✅ | Correctly updated |
| `/user/milestones` | GET | `milestone` | ✅ | Correctly updated |
| `/user/milestones/add` | POST | `milestone` | ✅ | Correctly updated |
| `/admin/dashboard` | GET | `participants`, `event_occurance`, `registration`, `donations` | ⚠️ | Verify all queries |
| `/admin/participants` | GET | `participants` | ✅ | Correctly updated |
| `/admin/participants/create` | POST | `participants` | ✅ | Correctly updated |
| `/admin/participants/:id` | GET | `participants`, `registration`, `program_enrollments`, `donations`, `milestone` | ✅ | Correctly updated |
| `/admin/participants/:id/edit` | POST | `participants` | ✅ | Correctly updated |
| `/admin/participants/:id/delete` | POST | `participants` | ✅ | Correctly updated |
| `/admin/participants/export/csv` | GET | ❌ `users` | 🔴 BROKEN | Uses OLD table name |
| `/admin/participants/export/pdf` | GET | ❌ `users` | 🔴 BROKEN | Uses OLD table name |
| `/admin/events` | GET | `event_occurance` | ✅ | Correctly updated |
| `/admin/events/create` | POST | `event_occurance` | ✅ | Correctly updated |
| `/admin/events/:id/edit` | POST | `event_occurance` | ✅ | Correctly updated |
| `/admin/events/:id/delete` | POST | `event_occurance` | ✅ | Correctly updated |
| `/admin/events/export/csv` | GET | ⚠️ `events` | 🟡 WRONG TABLE | Should use `event_occurance` with JOIN |
| `/admin/events/export/pdf` | GET | ⚠️ `events` | 🟡 WRONG TABLE | Should use `event_occurance` with JOIN |
| `/admin/registrations` | GET | `registration`, `events`, `participants` | ✅ | Correctly updated |
| `/admin/registrations/create` | POST | `events`, `participants`, `event_occurance`, `registration` | ✅ | Correctly updated |
| `/admin/surveys` | GET | `registration`, `participants`, `events` | ✅ | Correctly updated (uses merged table) |
| `/admin/surveys/:id/edit` | POST | `registration`, `events`, `participants`, `event_occurance` | ✅ | Correctly updated |
| `/admin/surveys/:id/delete` | POST | `registration` | ✅ | Correctly updated |
| `/admin/milestones` | GET | `milestone`, `participants` | ✅ | Correctly updated |
| `/admin/milestones/user/:userId` | GET | ❌ `users`, ❌ `participant_milestones`, ❌ `milestones` | 🔴 BROKEN | Uses OLD schema |
| `/admin/milestones/create` | POST | ❌ `milestones` | 🔴 BROKEN | Uses OLD table name |
| `/admin/milestones/:id/edit` | POST | ❌ `milestones` | 🔴 BROKEN | Uses OLD table name |
| `/admin/milestones/:id/delete` | POST | ❌ `milestones` | 🔴 BROKEN | Uses OLD table name |
| `/admin/donations` | GET | `donations` | ⚠️ | Verify column names |

**Summary:**
- ✅ **Working:** 30 routes
- ⚠️ **Needs Verification:** 5 routes (donations-related, events export)
- 🔴 **BROKEN:** 8 routes (milestones admin, participant/event exports)

---

## IMMEDIATE ACTION REQUIRED

### Priority 1: Fix Broken Routes (CRITICAL)

These routes will cause **runtime errors** in production:

1. **Fix Milestone Admin Routes** (app.js:2114-2189)
   - Update 4 routes to use NEW schema
   - Change `users` → `participants`
   - Change `milestones` → `milestone`
   - Remove JOIN logic (no longer needed)

2. **Fix Participant Export Routes** (app.js:2347-2449)
   - Update 2 routes (CSV + PDF)
   - Change `users` → `participants`
   - Update column references (name, email, role)
   - Update search filters

3. **Fix Event Export Routes** (app.js:2455-2553)
   - Update 2 routes (CSV + PDF)
   - Decide: Export templates OR occurrences?
   - If templates: Use `events` table (fix column names)
   - If occurrences: Use `event_occurance` with JOIN to `events`

### Priority 2: Verify Donations Routes (MEDIUM)

Check all donation-related routes use correct column names:
- `donation_id` (not `id`)
- `participant_id` (not `user_id`)
- `donation_amount` (not `amount`)

### Priority 3: Fix Login Redirect (LOW)

Line 498: Change `user.role` → `user.participant_role`

---

## DEPLOYMENT CHECKLIST

Before deploying to AWS:

- [ ] Fix all 8 BROKEN routes identified above
- [ ] Verify donations column names
- [ ] Fix login redirect (line 498)
- [ ] Load `new-database-setup.sql` to RDS (NOT the old schema!)
- [ ] Test all admin routes locally
- [ ] Test all export functionality (CSV/PDF)
- [ ] Verify milestone creation/editing works
- [ ] Test login with admin@ellarises.org / admin123
- [ ] Set SESSION_SECRET in EB environment
- [ ] Configure MAIL_* variables for SES

**⚠️ DO NOT DEPLOY until all BROKEN routes are fixed!**

---

## FILES THAT NEED UPDATES

1. **app.js** (primary file)
   - Lines 2114-2189 (milestone routes)
   - Lines 2347-2449 (participant exports)
   - Lines 2455-2553 (event exports)
   - Line 498 (login redirect)
   - Various donation routes (verify)

2. **Database Schema File for AWS**
   - Use: `new-database-setup.sql`
   - DO NOT USE: `database-setup.sql` or `rds-bootstrap.sql`

3. **Deployment Package**
   - Current v4.zip includes OLD `database-setup.sql`
   - Need v5.zip with:
     - Updated app.js (fixes above)
     - `new-database-setup.sql` (renamed to database-setup.sql for EB)
     - Updated documentation

---

## RECOMMENDED NEXT STEPS

1. **Create app.js fixes**
   - Fix 8 broken routes
   - Verify donations routes
   - Fix login redirect

2. **Test locally with new-database-setup.sql**
   - Drop local database
   - Load new-database-setup.sql
   - Run app.js
   - Test all affected routes
   - Verify exports work

3. **Create v5.zip deployment package**
   - Include fixed app.js
   - Include new-database-setup.sql (as database-setup.sql)
   - Update documentation
   - Verify package contents

4. **Deploy to AWS**
   - Load new-database-setup.sql to RDS ebdb
   - Upload v5.zip to Elastic Beanstalk
   - Set SESSION_SECRET
   - Test production deployment

---

## CONCLUSION

The NEW schema (`new-database-setup.sql`) represents a **significant improvement** with:
- Better organization (merged tables)
- Clearer naming (prefixed columns)
- Improved structure (event templates vs occurrences)

**However**, app.js has been only **70% updated**, leaving **8 critical routes broken**.

**Estimated work to fix:** 2-3 hours of focused development + testing

**Risk if deployed as-is:** Admin functionality completely broken, exports non-functional

**Recommendation:** Fix all BROKEN routes before deploying to production.

---

**Analysis Date:** December 3, 2025
**Schema Version:** new-database-setup.sql (Hybrid Schema)
**App Version:** app.js (Partially Updated)
**Status:** ⚠️ NOT PRODUCTION READY - Critical fixes required
