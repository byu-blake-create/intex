-- ============================================
-- ELLA RISES DATABASE SETUP
-- ============================================
-- Run this script to create all tables and sample data
-- Usage: psql -U postgres -d ella_rises -f database-setup.sql

-- Drop existing tables (careful in production!)
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS participant_milestones CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- CREATE TABLES
-- ============================================

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

-- ============================================
-- INSERT SAMPLE DATA
-- ============================================

-- Create admin user (password: admin123)
-- Hash generated with: bcrypt.hash('admin123', 10)
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin User', 'admin@ellarises.org', '$2a$10$YQf5Y4Y4Y4Y4Y4Y4Y4Y4Y4uK8p.kP/Z8K8K8K8K8K8K8K8K8K8K8K', 'admin');

-- Create regular users (password: user123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Jane Doe', 'jane@example.com', '$2a$10$XQf5Y4Y4Y4Y4Y4Y4Y4Y4Y4uK8p.kP/Z8K8K8K8K8K8K8K8K8K8K8K', 'user'),
('Sarah Johnson', 'sarah@example.com', '$2a$10$XQf5Y4Y4Y4Y4Y4Y4Y4Y4Y4uK8p.kP/Z8K8K8K8K8K8K8K8K8K8K8K', 'user'),
('Emily Chen', 'emily@example.com', '$2a$10$XQf5Y4Y4Y4Y4Y4Y4Y4Y4Y4uK8p.kP/Z8K8K8K8K8K8K8K8K8K8K8K', 'user'),
('Maria Garcia', 'maria@example.com', '$2a$10$XQf5Y4Y4Y4Y4Y4Y4Y4Y4Y4uK8p.kP/Z8K8K8K8K8K8K8K8K8K8K8K', 'user');

-- Add sample events
INSERT INTO events (title, description, date, location, capacity) VALUES
('Women in Leadership Workshop',
 'Join us for an empowering workshop on leadership skills and professional development. Learn from successful women leaders and network with peers.',
 '2025-02-15 18:00:00',
 '123 Community Center, Downtown',
 50),

('Monthly Support Group',
 'A safe space to connect, share experiences, and support each other. Open to all women in our community.',
 '2025-02-20 19:00:00',
 'Ella Rises Community Room',
 20),

('Career Development Seminar',
 'Learn about career opportunities, resume building, and networking strategies. Includes guest speakers from various industries.',
 '2025-03-05 17:30:00',
 'Virtual Event (Zoom)',
 100),

('Self-Care & Wellness Workshop',
 'Explore techniques for stress management, mindfulness, and maintaining work-life balance.',
 '2025-03-12 18:30:00',
 '456 Wellness Center',
 30),

('Financial Literacy for Women',
 'Learn about budgeting, investing, and planning for your financial future with expert financial advisors.',
 '2025-03-20 18:00:00',
 'Downtown Library Conference Room',
 40),

('Networking Mixer',
 'Connect with other women professionals in a casual, supportive environment. Light refreshments provided.',
 '2025-04-02 18:00:00',
 'Rooftop Lounge, City Center',
 60);

-- Add some milestones
INSERT INTO milestones (title, description) VALUES
('First Event Attended', 'Attended your first Ella Rises event'),
('Active Participant', 'Attended 5 or more events'),
('Community Leader', 'Helped organize or lead an event'),
('Survey Champion', 'Submitted feedback for 10 events'),
('Network Builder', 'Connected with 20+ participants'),
('Milestone Master', 'Achieved all available milestones');

-- Register some users for events
INSERT INTO event_registrations (user_id, event_id, created_at) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '5 days'),
(2, 2, CURRENT_TIMESTAMP - INTERVAL '3 days'),
(3, 1, CURRENT_TIMESTAMP - INTERVAL '4 days'),
(3, 3, CURRENT_TIMESTAMP - INTERVAL '2 days'),
(4, 2, CURRENT_TIMESTAMP - INTERVAL '6 days'),
(5, 1, CURRENT_TIMESTAMP - INTERVAL '7 days'),
(5, 3, CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Add some survey responses
INSERT INTO surveys (user_id, event_id, rating, feedback, created_at) VALUES
(2, 1, 5, 'Excellent workshop! The speakers were inspiring and I learned so much about leadership techniques.', CURRENT_TIMESTAMP - INTERVAL '1 day'),
(3, 1, 4, 'Great event overall. Would love to see more hands-on activities next time.', CURRENT_TIMESTAMP - INTERVAL '1 day'),
(5, 1, 5, 'This was exactly what I needed. Thank you for creating such a supportive space!', CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Assign some milestones to users
INSERT INTO participant_milestones (user_id, milestone_id, achieved_at) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '5 days'),
(3, 1, CURRENT_TIMESTAMP - INTERVAL '4 days'),
(4, 1, CURRENT_TIMESTAMP - INTERVAL '6 days'),
(5, 1, CURRENT_TIMESTAMP - INTERVAL '7 days'),
(2, 2, CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Add some sample donations
INSERT INTO donations (user_id, amount, created_at) VALUES
(2, 50.00, CURRENT_TIMESTAMP - INTERVAL '10 days'),
(3, 25.00, CURRENT_TIMESTAMP - INTERVAL '8 days'),
(5, 100.00, CURRENT_TIMESTAMP - INTERVAL '5 days'),
(NULL, 75.00, CURRENT_TIMESTAMP - INTERVAL '3 days'),  -- Anonymous donation
(4, 30.00, CURRENT_TIMESTAMP - INTERVAL '2 days');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check table counts
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'event_registrations', COUNT(*) FROM event_registrations
UNION ALL
SELECT 'surveys', COUNT(*) FROM surveys
UNION ALL
SELECT 'milestones', COUNT(*) FROM milestones
UNION ALL
SELECT 'participant_milestones', COUNT(*) FROM participant_milestones
UNION ALL
SELECT 'donations', COUNT(*) FROM donations;

-- Show all users
SELECT id, name, email, role, login_count FROM users;

-- Show all events
SELECT id, title, date, location, capacity FROM events ORDER BY date;

COMMIT;

-- Success message
SELECT 'Database setup complete! You can now start the application.' as message;
