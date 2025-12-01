# Quick Start Guide - Ella Rises

Get up and running in 5 minutes!

## Prerequisites

- Node.js installed ✓
- PostgreSQL installed and running
- Git ✓

## Step-by-Step Setup

### 1. Install Dependencies (Already Done!)
```bash
npm install
```
✅ Dependencies are already installed!

### 2. Set Up PostgreSQL Database

**Option A: Using the SQL Script (Recommended)**
```bash
# Create the database
createdb ella_rises

# Run the setup script
psql -U postgres -d ella_rises -f database-setup.sql
```

**Option B: Manual Setup**
```bash
# Create database
createdb ella_rises

# Or using psql:
psql -U postgres
CREATE DATABASE ella_rises;
\q

# Then run the SQL commands from database-setup.sql manually
```

### 3. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and update:
# - DB_PASSWORD with your PostgreSQL password
# - SESSION_SECRET with a random string
```

**Example .env:**
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_NAME=ella_rises
SESSION_SECRET=change_this_to_something_random
```

### 4. Start the Application

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### 5. Access the Application

Open your browser and go to:
```
http://localhost:3000
```

## Default Login Credentials

**Admin Account:**
- Email: `admin@ellarises.org`
- Password: `admin123`

**Test User Accounts:**
- Email: `jane@example.com`
- Password: `user123`

## Testing the Application

### Test User Features:
1. Sign up for a new account at `/signup`
2. Login at `/login`
3. Browse events at `/events`
4. Register for an event
5. View your dashboard at `/user/dashboard`
6. Submit a survey at `/user/survey`

### Test Admin Features:
1. Login as admin
2. Go to `/admin/dashboard`
3. View participants at `/admin/participants`
4. Search for users
5. Click on a user to see their details
6. Try changing a user's password
7. View other admin sections (events, surveys, milestones, donations)

## Troubleshooting

### "Error: connect ECONNREFUSED 127.0.0.1:5432"
**Problem:** Can't connect to PostgreSQL

**Solution:**
```bash
# Check if PostgreSQL is running
sudo service postgresql status

# Start PostgreSQL if needed
sudo service postgresql start

# Or on Mac:
brew services start postgresql
```

### "relation 'users' does not exist"
**Problem:** Database tables not created

**Solution:**
```bash
# Run the database setup script
psql -U postgres -d ella_rises -f database-setup.sql
```

### Port 3000 already in use
**Problem:** Another app is using port 3000

**Solution:**
```bash
# Option 1: Change PORT in .env to 3001 or another port
# Option 2: Find and kill the process using port 3000
lsof -ti:3000 | xargs kill
```

### Cannot find module 'express'
**Problem:** Dependencies not installed

**Solution:**
```bash
npm install
```

## Common Tasks

### Create a New User
```bash
node create-user.js
```
Follow the prompts to generate SQL for a new user with hashed password.

### Make a User an Admin
```sql
-- Connect to database
psql -U postgres -d ella_rises

-- Update user role
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

### View All Users
```sql
psql -U postgres -d ella_rises

SELECT id, name, email, role, login_count FROM users;
```

### Reset Database
```bash
# Drop and recreate
dropdb ella_rises
createdb ella_rises
psql -U postgres -d ella_rises -f database-setup.sql
```

## Project Structure

```
intex/
├── app.js              # Main application (all routes here!)
├── package.json        # Dependencies
├── .env               # Your configuration (not in Git)
├── database-setup.sql # Database setup script
├── create-user.js     # Helper to create users
├── public/            # Static files
│   ├── css/main.css   # Styling
│   └── js/main.js     # Client-side JS
└── views/             # EJS templates
    ├── partials/      # Header & footer
    ├── *.ejs          # Public pages
    ├── events/        # Event pages
    ├── user/          # User pages
    └── admin/         # Admin pages
```

## Key Routes

| Route | Description | Access |
|-------|-------------|--------|
| `/` | Landing page | Public |
| `/events` | Browse events | Public |
| `/events/:id` | Event detail & signup | Public view, login to register |
| `/login` | Login | Public |
| `/signup` | Create account | Public |
| `/user/dashboard` | User dashboard | User |
| `/admin/dashboard` | Admin dashboard | Admin |
| `/admin/participants` | Manage users | Admin |
| `/admin/participants/:id` | User details & password change | Admin |

## Need Help?

Check the full README.md for detailed information about:
- Complete feature list
- Database schema
- All available routes
- Security features
- Deployment instructions

## Next Steps

1. ✅ Set up database
2. ✅ Configure .env
3. ✅ Start the server
4. ✅ Test the application
5. 📝 Customize for your needs
6. 🚀 Deploy to production

Happy coding! 🎉
