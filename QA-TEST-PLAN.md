# Ella Rises - QA Test Plan
**Generated:** December 3, 2025
**Application Version:** 1.0
**Test Environment:** Development

---

## Test Problem 1: Authentication - Login with Valid Credentials
**Category:** Authentication
**Priority:** Critical
**Route:** POST /login

**Preconditions:**
- Database contains user with email `admin@test.com` and password `admin123`

**Test Steps:**
1. Navigate to http://localhost:3000/login
2. Enter email: `admin@test.com`
3. Enter password: `admin123`
4. Click "Login" button

**Expected Results:**
- ✅ User is redirected to /admin/dashboard (for admin users)
- ✅ Session is created and stored
- ✅ Navigation shows "Hello, [Username]" with Admin button
- ✅ No error messages displayed

**Edge Cases to Test:**
- Login with trailing spaces in email
- Login with uppercase email (should be case-insensitive)
- Login with correct credentials but database connection lost

---

## Test Problem 2: Authentication - Login with Invalid Credentials
**Category:** Authentication / Error Handling
**Priority:** Critical
**Route:** POST /login

**Test Steps:**
1. Navigate to http://localhost:3000/login
2. Enter email: `admin@test.com`
3. Enter password: `wrongpassword`
4. Click "Login" button

**Expected Results:**
- ✅ User remains on /login page
- ✅ Error message displayed: "Invalid email or password"
- ✅ Email field retains entered value
- ✅ Password field is cleared
- ✅ No session created
- ✅ Error has proper ARIA attributes (role="alert", aria-live="polite")

**Edge Cases to Test:**
- Non-existent email address
- Empty password field
- SQL injection attempts in email field
- XSS attempts in email field

---

## Test Problem 3: Admin - CSV Export with Search Filter
**Category:** Data Export / Admin
**Priority:** High
**Route:** GET /admin/participants/export/csv

**Preconditions:**
- Logged in as admin user
- Database contains multiple participants

**Test Steps:**
1. Navigate to http://localhost:3000/admin/participants
2. Enter search term in search box (e.g., "John")
3. Click "Search" button
4. Verify filtered results are shown
5. Click "📊 Export CSV" button

**Expected Results:**
- ✅ CSV file downloads with filename "participants.csv"
- ✅ CSV contains ONLY filtered participants (matching "John")
- ✅ CSV headers: ID, Name, Email, Role, Total Donations, Login Count, Created At
- ✅ Total Donations formatted as currency ($X.XX)
- ✅ Dates formatted properly
- ✅ No SQL errors in server logs

**Edge Cases to Test:**
- Export with no search filter (all participants)
- Export when search returns 0 results
- Export with special characters in search term
- Export with 1000+ participants (performance test)

---

## Test Problem 4: Admin - PDF Export Pagination
**Category:** Data Export / Admin
**Priority:** High
**Route:** GET /admin/events/export/pdf

**Preconditions:**
- Logged in as admin user
- Database contains 50+ events

**Test Steps:**
1. Navigate to http://localhost:3000/admin/events
2. Click "📄 Export PDF" button
3. Open downloaded PDF file

**Expected Results:**
- ✅ PDF downloads with filename "events.pdf"
- ✅ PDF has proper header: "Ella Rises - Events Report"
- ✅ PDF shows generation date
- ✅ Events that exceed page limit (y > 650) start on new page
- ✅ All 50+ events are included
- ✅ No text overlap or truncation
- ✅ PDF is readable and properly formatted

**Edge Cases to Test:**
- Export with 0 events (empty database)
- Export with events containing very long descriptions
- Export with events containing special characters
- Open PDF in different PDF readers (compatibility test)

---

## Test Problem 5: User Registration - Event Registration at Capacity
**Category:** Business Logic / Event Management
**Priority:** Critical
**Route:** POST /events/:id/register

**Preconditions:**
- User is logged in (non-admin)
- Event exists with capacity = 10, current_attendees = 10 (FULL)

**Test Steps:**
1. Navigate to http://localhost:3000/events/[event_id]
2. Attempt to click "Register" button

**Expected Results:**
- ✅ Registration button is disabled OR shows "Event Full"
- ✅ If button clicked, redirect to /events/[event_id]?message=event_full
- ✅ Error message displayed: "This event is at capacity"
- ✅ User NOT added to event_registrations table
- ✅ current_attendees count remains at 10

**Edge Cases to Test:**
- Two users try to register simultaneously for last spot (race condition)
- User already registered tries to register again
- Event capacity increased while registration page open
- Negative capacity values

---

## Test Problem 6: Donation Trigger - Total Donations Update
**Category:** Database Integrity / Triggers
**Priority:** Critical
**Routes:** POST /admin/donations (create), POST /admin/donations/:id (update)

**Preconditions:**
- User exists with total_donations = $100.00
- User has 2 donations: $50.00 and $50.00

**Test Steps:**
1. Login as admin
2. Navigate to http://localhost:3000/admin/donations
3. Add new donation for user: $25.00
4. Navigate to /admin/participants
5. Verify user's total_donations column

**Expected Results:**
- ✅ User's total_donations updated to $125.00
- ✅ Trigger executes automatically (update_user_total_donations)
- ✅ Total calculated correctly: SUM(50 + 50 + 25) = 125
- ✅ No manual refresh needed
- ✅ Decimal precision maintained (2 decimal places)

**Edge Cases to Test:**
- Delete a donation (total should decrease)
- Update donation amount (total should recalculate)
- Add donation with NULL donation_date
- Add donation with negative amount (should fail validation)
- Add donation for non-existent user (should fail foreign key constraint)

---

## Test Problem 7: 404 Error Page - Non-Existent Route
**Category:** Error Handling / UX
**Priority:** Medium
**Route:** GET /nonexistent-page

**Test Steps:**
1. Navigate to http://localhost:3000/this-page-does-not-exist
2. Observe error page

**Expected Results:**
- ✅ HTTP status code: 404
- ✅ Custom 404 page displayed (not default browser error)
- ✅ Page shows butterfly emoji 🦋
- ✅ Page shows "404" in large font
- ✅ Message: "Page Not Found"
- ✅ Navigation buttons present: "Go Home", "View Events", "Contact Us"
- ✅ Header and footer still visible
- ✅ User session preserved (if logged in)

**Edge Cases to Test:**
- 404 for logged in user (should show user menu)
- 404 for logged out user (should show login button)
- 404 for admin user (admin button still visible)
- Click navigation buttons to verify they work

---

## Test Problem 8: 500 Error Page - Server Error Simulation
**Category:** Error Handling
**Priority:** Medium
**Route:** Any route that triggers server error

**Test Steps:**
1. Temporarily modify app.js to throw error in a route (or simulate database connection failure)
2. Navigate to the affected route
3. Observe error page

**Expected Results:**
- ✅ HTTP status code: 500
- ✅ Custom 500 page displayed
- ✅ Page shows warning emoji ⚠️
- ✅ Page shows "500" in large font
- ✅ Message: "Internal Server Error"
- ✅ Troubleshooting tips displayed
- ✅ Action buttons: "Go Home", "Try Again", "Report Issue"
- ✅ In development (NODE_ENV !== production), error stack trace shown
- ✅ In production, error stack trace hidden

**Edge Cases to Test:**
- Error in middleware (session, authentication)
- Database query failure
- File system error
- Email sending failure

---

## Test Problem 9: Form Validation - Empty Required Fields
**Category:** Form Validation
**Priority:** High
**Route:** POST /signup

**Test Steps:**
1. Navigate to http://localhost:3000/signup
2. Leave all fields empty
3. Click "Sign Up" button

**Expected Results:**
- ✅ Browser HTML5 validation prevents form submission
- ✅ Error messages shown for each required field
- ✅ Fields have `required` attribute in HTML
- ✅ Form does not submit
- ✅ No server request made (prevented client-side)

**Test Steps (Server-Side Validation):**
1. Use browser dev tools to remove `required` attributes
2. Submit form with empty fields

**Expected Results:**
- ✅ Server-side validation catches empty fields
- ✅ Error message returned: "All fields are required" or similar
- ✅ User remains on /signup page
- ✅ No database entry created

**Edge Cases to Test:**
- Fields with only whitespace
- Fields with HTML tags (XSS prevention)
- Very long input values (buffer overflow prevention)
- Special characters in name field

---

## Test Problem 10: Email Functionality - Event Registration Confirmation
**Category:** Email / Integration
**Priority:** High
**Route:** POST /events/:id/register

**Preconditions:**
- MAIL_* environment variables configured
- SES sandbox mode OR production mode
- User email verified in SES (if sandbox mode)

**Test Steps:**
1. Login as user with verified email
2. Navigate to /events
3. Find upcoming event
4. Click event to view details
5. Click "Register" button
6. Check user's email inbox

**Expected Results:**
- ✅ Registration successful message shown
- ✅ Email sent to user's email address
- ✅ Email subject: "Registration Confirmed: [Event Title]"
- ✅ Email contains event details (title, date, location, time)
- ✅ Email is properly formatted HTML
- ✅ Email sent FROM configured MAIL_FROM address
- ✅ If email fails, registration still succeeds (graceful degradation)

**Edge Cases to Test:**
- Email sending fails (SMTP error) - registration should still work
- User email not verified in SES sandbox - registration works, email fails silently
- Event with special characters in title
- Event with very long description
- Multiple simultaneous registrations (email queue handling)

---

## Test Problem 11: Admin Access Control - Non-Admin User
**Category:** Security / Authorization
**Priority:** Critical
**Route:** GET /admin/dashboard

**Preconditions:**
- User logged in with role = 'user' (NOT admin)

**Test Steps:**
1. Login as regular user (participant123 / participant123)
2. Manually navigate to http://localhost:3000/admin/dashboard
3. Attempt to access admin routes

**Expected Results:**
- ✅ User redirected to /login or / (home page)
- ✅ Error message: "Access denied" or "Admin access required"
- ✅ Admin dashboard NOT accessible
- ✅ No admin data exposed
- ✅ Session remains valid (user not logged out)

**Edge Cases to Test:**
- Access /admin/participants
- Access /admin/events
- Access /admin/donations
- Access /admin/participants/export/csv (should be blocked)
- Modify session cookie to change role (should not work)
- Access admin routes via POST requests

---

## Test Problem 12: Pagination - Large Dataset Navigation
**Category:** Data Display / Performance
**Priority:** Medium
**Route:** GET /admin/participants

**Preconditions:**
- Database contains 100+ participants

**Test Steps:**
1. Login as admin
2. Navigate to http://localhost:3000/admin/participants
3. Observe pagination controls
4. Click "Next" button
5. Click specific page number
6. Click "Previous" button

**Expected Results:**
- ✅ Page 1 shows first 20 participants (default limit)
- ✅ Pagination shows: ← Previous [1] 2 3 ... 10 Next →
- ✅ Current page highlighted (btn-primary style)
- ✅ Clicking "Next" loads page 2
- ✅ URL updates to include ?page=2
- ✅ "Previous" button visible on page 2+
- ✅ "Previous" button hidden on page 1
- ✅ Total count displayed: "Showing page X of Y (Z total participants)"

**Edge Cases to Test:**
- Navigate to page 99999 (non-existent page) - should show page 1 or last page
- Navigate to page 0 or negative page - should default to page 1
- Search filter + pagination (page resets to 1 on new search)
- URL manipulation: ?page=abc (non-numeric) - should default to page 1

---

## Test Problem 13: Multi-Language Support - Spanish Toggle
**Category:** Internationalization
**Priority:** Medium
**Route:** GET /?lang=es

**Test Steps:**
1. Navigate to http://localhost:3000
2. Scroll to footer
3. Click language toggle button "Español"
4. Observe page content

**Expected Results:**
- ✅ URL changes to /?lang=es
- ✅ Page content translates to Spanish
- ✅ Navigation labels in Spanish
- ✅ Button changes to "English"
- ✅ Cookie or session stores language preference
- ✅ Language persists across page navigation
- ✅ HTML lang attribute changes to "es"

**Test Steps (Persistence):**
1. Change language to Spanish
2. Navigate to /events
3. Verify /events page is in Spanish

**Expected Results:**
- ✅ Events page displays in Spanish
- ✅ Language preference persists

**Edge Cases to Test:**
- Invalid language code: /?lang=fr (should default to English)
- Missing translations (should fallback to English)
- Special characters in translated strings
- Number and date formatting (locale-specific)

---

## Test Problem 14: Session Expiration - Expired Session Handling
**Category:** Security / Session Management
**Priority:** High
**Routes:** All authenticated routes

**Preconditions:**
- Session timeout set in app.js (express-session maxAge)

**Test Steps:**
1. Login as user
2. Wait for session to expire (or manually delete session cookie)
3. Attempt to access /user/dashboard
4. Attempt to perform action requiring authentication

**Expected Results:**
- ✅ User redirected to /login
- ✅ Message: "Session expired, please login again"
- ✅ Original URL preserved for redirect after login
- ✅ No error thrown
- ✅ User can login again successfully

**Edge Cases to Test:**
- Session expires during form submission
- Session expires during file upload
- Session cookie tampered with
- Session cookie deleted manually
- Multiple tabs open (session expires in one tab)

---

## Test Problem 15: Database Constraint Validation - Duplicate Event Registration
**Category:** Database Integrity
**Priority:** Critical
**Route:** POST /events/:id/register

**Preconditions:**
- User already registered for specific event

**Test Steps:**
1. Login as user
2. Navigate to event detail page for event user already registered for
3. Attempt to register again

**Expected Results:**
- ✅ Registration button shows "Already Registered" or is disabled
- ✅ If attempted via direct POST: Error message displayed
- ✅ Database unique constraint prevents duplicate entry
- ✅ Error message: "You are already registered for this event"
- ✅ current_attendees count NOT incremented
- ✅ No duplicate row in event_registrations table

**Edge Cases to Test:**
- Rapid double-click on register button (race condition)
- Two browser tabs open, register in both simultaneously
- Register, unregister, register again (should work)
- Database constraint at schema level: UNIQUE(user_id, event_id)

---

## Test Execution Summary

### Priority Distribution:
- **Critical:** 7 tests
- **High:** 5 tests
- **Medium:** 3 tests

### Category Coverage:
- Authentication: 2 tests
- Admin Functions: 3 tests
- Data Export: 2 tests
- Error Handling: 2 tests
- Form Validation: 1 test
- Email Integration: 1 test
- Security: 2 tests
- Performance: 1 test
- Internationalization: 1 test
- Database Integrity: 2 tests

### Routes Tested:
- GET /login
- POST /login
- POST /signup
- GET /admin/dashboard
- GET /admin/participants
- GET /admin/events
- GET /admin/donations
- GET /admin/participants/export/csv
- GET /admin/events/export/pdf
- GET /events/:id
- POST /events/:id/register
- GET /[non-existent routes] (404)
- Server errors (500)

### Recommended Testing Tools:
- Manual testing via browser
- Postman/Insomnia for API testing
- Browser DevTools for network inspection
- PostgreSQL client for database verification
- Screen reader testing (NVDA/JAWS) for accessibility
- Multiple browsers (Chrome, Firefox, Safari, Edge)

---

## Test Environment Setup

**Database:**
```bash
# Ensure test data exists
psql -U postgres -d ella_rises -c "SELECT COUNT(*) FROM users;"
psql -U postgres -d ella_rises -c "SELECT COUNT(*) FROM events;"
psql -U postgres -d ella_rises -c "SELECT COUNT(*) FROM donations;"
```

**Server:**
```bash
# Start server
cd /root/intex
node app.js
```

**Test Users:**
- Admin: admin@test.com / admin123
- User: participant123@example.com / participant123

---

## Notes:
- All tests should be executed in both development and production-like environments
- Security tests (#11) are critical for deployment readiness
- Export tests (#3, #4) verify bonus feature implementation
- Error handling tests (#7, #8) verify custom error pages
- Email tests (#10) may require SES configuration
