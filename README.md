# Ella Rises - Web Application

A full-stack JavaScript web application for the Ella Rises organization, built with Node.js, Express, EJS, and PostgreSQL.

## Features

### Public Features
- **Landing Page**: Professional homepage styled after ellarises.org
- **Events Browsing**: View upcoming events without logging in
- **User Registration**: Create new accounts with secure password hashing

### User Features
- **User Dashboard**: Personal overview of registered events and milestones
- **Event Registration**: Browse and sign up for events
- **Milestones Tracking**: View personal achievements
- **Survey Submission**: Provide feedback on attended events

### Admin Features
- **Admin Dashboard**: Central hub for all administrative functions
- **Participants Management**:
  - View all users with search/filter functionality
  - Track login counts for each user
  - View participant details and registered events
  - Change user passwords
- **Events Management**: View and manage all events
- **Survey Management**: Review all survey responses
- **Milestones Management**: View all milestones
- **Donations Management**: Track donation records
- **Analytics Dashboard**: Placeholder for Tableau dashboard integration

## Tech Stack

- **Backend**: Node.js with Express.js
- **View Engine**: EJS (Embedded JavaScript Templates)
- **Database**: PostgreSQL
- **Database ORM**: Knex.js
- **Authentication**: express-session with bcryptjs for password hashing
- **Styling**: Custom CSS with modern design system

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **PostgreSQL** (v12 or higher)
- **Git** (for cloning the repository)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd intex
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up PostgreSQL Database

Create a new PostgreSQL database:

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE ella_rises;

# Exit psql
\q
```

### 4. Create Database Tables

Run the following SQL commands to create the required tables:

```sql
-- Users table (includes both regular users and admins)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event registrations table (junction table)
CREATE TABLE event_registrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, event_id)
);

-- Surveys table
CREATE TABLE surveys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Milestones table
CREATE TABLE milestones (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participant milestones (junction table)
CREATE TABLE participant_milestones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, milestone_id)
);

-- Donations table
CREATE TABLE donations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Add Sample Data (Optional)

```sql
-- Create an admin user (password: admin123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin User', 'admin@ellarises.org', '$2a$10$8F9zYhZ0KQXgRZp3YxXxEOKXr1gXqZ5K6dV8HQXqZ5K6dV8HQXqZ5', 'admin');

-- Create a regular user (password: user123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Jane Doe', 'jane@example.com', '$2a$10$9G0aZiA1LRYhSAq4ZyYyFPLYs2hYrA6L7eW9IQYrA6L7eW9IQYrA6', 'user');

-- Add some sample events
INSERT INTO events (title, description, date, location, capacity) VALUES
('Women in Leadership Workshop', 'Join us for an empowering workshop on leadership skills and professional development.', '2025-02-15 18:00:00', '123 Community Center, Downtown', 50),
('Monthly Support Group', 'A safe space to connect, share experiences, and support each other.', '2025-02-20 19:00:00', 'Ella Rises Community Room', 20),
('Career Development Seminar', 'Learn about career opportunities and networking strategies.', '2025-03-05 17:30:00', 'Virtual Event (Zoom)', 100);

-- Add some milestones
INSERT INTO milestones (title, description) VALUES
('First Event Attended', 'Attended your first Ella Rises event'),
('Active Participant', 'Attended 5 or more events'),
('Community Leader', 'Helped organize or lead an event'),
('Survey Champion', 'Submitted feedback for 10 events');
```

### 6. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
# Server Configuration
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=ella_rises

# Session Configuration
SESSION_SECRET=your_super_secret_session_key_change_this_in_production
```

**Important**: Replace `your_postgres_password` with your actual PostgreSQL password.

## Running the Application

### Development Mode (with auto-restart)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will be available at `http://localhost:3000`

## User Accounts

### Default Admin Account
- **Email**: admin@ellarises.org
- **Password**: admin123 (if you used the sample data above)

### Creating New Admin Users

Admins can be created by manually updating the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

Or by inserting a new admin user with a hashed password.

## Application Routes

### Public Routes
- `GET /` - Landing page
- `GET /events` - List all events
- `GET /events/:id` - Event detail page
- `GET /login` - Login page
- `POST /login` - Handle login
- `GET /signup` - Signup page
- `POST /signup` - Handle registration
- `GET /logout` - Logout

### User Routes (Requires Login)
- `GET /user/dashboard` - User dashboard
- `GET /user/events` - User's registered events
- `GET /user/milestones` - User's milestones
- `GET /user/survey` - Survey submission form
- `POST /user/survey` - Submit survey
- `POST /events/:id/signup` - Register for event

### Admin Routes (Requires Admin Role)
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/participants` - List all users (with search)
- `GET /admin/participants/:id` - User detail page
- `POST /admin/participants/:id/change-password` - Change user password
- `GET /admin/events` - Manage events
- `GET /admin/surveys` - View survey responses
- `GET /admin/milestones` - Manage milestones
- `GET /admin/donations` - View donations
- `GET /admin/analytics` - Analytics dashboard (placeholder)

## Project Structure

```
intex/
├── app.js                 # Main application file with all routes
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (not in Git)
├── .env.example           # Example environment configuration
├── README.md              # This file
├── public/                # Static assets
│   ├── css/
│   │   └── main.css       # Main stylesheet
│   ├── js/
│   │   └── main.js        # Client-side JavaScript
│   └── images/            # Image assets
└── views/                 # EJS templates
    ├── partials/
    │   ├── header.ejs     # Header with navigation
    │   └── footer.ejs     # Footer
    ├── index.ejs          # Landing page
    ├── login.ejs          # Login page
    ├── signup.ejs         # Signup page
    ├── events/
    │   ├── index.ejs      # Events list
    │   └── detail.ejs     # Event detail
    ├── user/
    │   ├── dashboard.ejs  # User dashboard
    │   ├── events.ejs     # User events
    │   ├── milestones.ejs # User milestones
    │   └── survey.ejs     # Survey form
    └── admin/
        ├── dashboard.ejs       # Admin dashboard
        ├── participants.ejs    # Participants list
        ├── participantDetail.ejs # Participant detail
        ├── events.ejs          # Events management
        ├── surveys.ejs         # Surveys management
        ├── milestones.ejs      # Milestones management
        ├── donations.ejs       # Donations management
        └── analytics.ejs       # Analytics dashboard
```

## Key Features Explained

### Authentication System
- Passwords are hashed using bcrypt before storage
- Session-based authentication using express-session
- Login count is automatically incremented on each successful login
- Role-based access control (user vs admin)

### Events System
- All event data comes from the database (no hardcoded events)
- Users can browse events publicly
- Registration requires login
- Dynamic event detail pages with registration status

### Admin Participants Management
- Search/filter users by name or email
- View detailed user information including login count
- See all events a user has registered for
- Change user passwords (hashed automatically)

### Security Features
- Passwords hashed with bcrypt (10 salt rounds)
- SQL injection protection via Knex parameterized queries
- Session secret for secure cookies
- Role-based route protection

## Development Notes

### No Controllers/Models Pattern
This is a first-draft implementation. All logic is intentionally kept in `app.js`:
- No `/controllers` directory
- No `/models` directory
- No `/db` directory
- No `knexfile.js`
- No migrations or seeds

This simplified structure makes it easy to understand the complete flow of the application. For production, consider refactoring into MVC pattern.

### Database Queries
All database queries use Knex.js inline in route handlers:
- `knex('table').select()` - Read
- `knex('table').insert()` - Create
- `knex('table').update()` - Update
- `knex('table').delete()` - Delete

### Styling
Custom CSS with CSS variables for easy theming. The design is inspired by the original ellarises.org website with a modern, clean aesthetic.

## Troubleshooting

### Database Connection Issues
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Ensure PostgreSQL is running and credentials in `.env` are correct.

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3000
```
**Solution**: Change the PORT in `.env` or stop the process using port 3000.

### Module Not Found
```
Error: Cannot find module 'express'
```
**Solution**: Run `npm install` to install all dependencies.

## Future Enhancements

- Refactor into MVC pattern with controllers and models
- Add Knex migrations for database schema management
- Implement forgot password functionality
- Add email notifications for event registrations
- Embed Tableau dashboard in analytics page
- Add CRUD operations for events in admin panel
- Implement file upload for user profile pictures
- Add pagination for large data sets
- Deploy to AWS with proper production configuration

## License

This project is developed for the Ella Rises organization.

## Contributors

- Your Team Name
- Team Member Names

## Support

For questions or issues, please contact [your-contact-info]
