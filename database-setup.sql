-- ============================================
-- ELLA RISES DATABASE SETUP - AWS DEPLOYMENT READY
-- ============================================
-- This script creates all tables, triggers, and sample data
-- Usage: psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d $RDS_DB_NAME -f database-setup.sql

-- Drop existing tables (careful in production!)
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS participant_milestones CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS program_enrollments CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS event_templates CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_user_total_donations() CASCADE;

-- ============================================
-- CREATE TABLES
-- ============================================

-- Users table (includes both participants and admins)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'participant' CHECK (role IN ('participant', 'admin')),
  date_of_birth DATE,
  phone VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(10),
  school_or_employer VARCHAR(255),
  field_of_interest VARCHAR(100),
  total_donations DECIMAL(10, 2) DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Event templates table (for recurring events)
CREATE TABLE event_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  description TEXT,
  recurrence_pattern VARCHAR(50),
  default_capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_template_id INTEGER REFERENCES event_templates(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  location VARCHAR(255),
  capacity INTEGER,
  registration_deadline TIMESTAMP,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on events
CREATE INDEX idx_events_start_time ON events(start_time);

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
  registration_id INTEGER REFERENCES event_registrations(id) ON DELETE CASCADE,
  satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  usefulness_rating INTEGER CHECK (usefulness_rating >= 1 AND usefulness_rating <= 5),
  instructor_rating INTEGER CHECK (instructor_rating >= 1 AND instructor_rating <= 5),
  recommendation_rating INTEGER CHECK (recommendation_rating >= 1 AND recommendation_rating <= 5),
  overall_score NUMERIC(3,2),
  net_promoter_score VARCHAR(20) CHECK (net_promoter_score IN ('Promoter', 'Passive', 'Detractor')),
  additional_feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on surveys
CREATE INDEX idx_surveys_user ON surveys(user_id);
CREATE INDEX idx_surveys_event ON surveys(event_id);

-- Milestones table
CREATE TABLE milestones (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participant milestones (junction table)
CREATE TABLE participant_milestones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  custom_title VARCHAR(255),
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Donations table
-- NOTE: donation_date can be NULL (user can choose to record donation date)
CREATE TABLE donations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  donation_number INTEGER,
  donor_name VARCHAR(255),
  donor_email VARCHAR(255),
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  donation_date TIMESTAMP  -- Can be NULL if user doesn't specify a date
);

-- Create index on donations
CREATE INDEX idx_donations_user ON donations(user_id);

-- Programs table
CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  age_range VARCHAR(100),
  schedule VARCHAR(255),
  fee DECIMAL(10, 2),
  additional_info TEXT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Program enrollments table (junction table)
CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  UNIQUE(user_id, program_id)
);

-- ============================================
-- CREATE TRIGGER FUNCTIONS
-- ============================================

-- Trigger function to update total_donations in users table
CREATE OR REPLACE FUNCTION update_user_total_donations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE users
    SET total_donations = (
      SELECT COALESCE(SUM(amount), 0)
      FROM donations
      WHERE user_id = NEW.user_id
    )
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on donations table
CREATE TRIGGER trigger_update_total_donations
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW
EXECUTE FUNCTION update_user_total_donations();

-- ============================================
-- INSERT INITIAL DATA
-- ============================================

-- Create admin user
-- Email: admin@ellarises.org
-- Password: admin123
INSERT INTO users (email, name, password_hash, role) VALUES
('admin@ellarises.org', 'Admin User', '$2a$10$dCwAFOvD0JYo3i/ztF2dxOxltLa.u6l8mYBx2b2jHmeeBEH3q8jGS', 'admin');

-- Create sample participant users
-- Password: participant123
INSERT INTO users (email, name, password_hash, role, city, state, field_of_interest) VALUES
('jane.doe@example.com', 'Jane Doe', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Provo', 'UT', 'Education'),
('sarah.johnson@example.com', 'Sarah Johnson', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Orem', 'UT', 'Business'),
('emily.chen@example.com', 'Emily Chen', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Spanish Fork', 'UT', 'Technology'),
('maria.garcia@example.com', 'Maria Garcia', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Springville', 'UT', 'Arts');

-- Insert milestone categories
INSERT INTO milestones (title, description, category) VALUES
('Apprenticeship', 'Secured an apprenticeship position', 'Apprenticeship'),
('Bachelor''s Degree', 'Earned a Bachelor''s degree', 'Bachelor''s Degree'),
('Certificates & Awards', 'Received certificates and awards', 'Certificates & Awards'),
('Middle School Diploma', 'Completed middle school education', 'Middle School Diploma'),
('Internship', 'Secured an internship position', 'Internship'),
('Project', 'Completed a significant project', 'Project'),
('Master''s Degree', 'Earned a Master''s degree', 'Master''s Degree'),
('Associate''s Degree', 'Earned an Associate''s degree', 'Associate''s Degree'),
('Career', 'Started a full-time career', 'Career'),
('High School Diploma', 'Completed high school education', 'High School Diploma');

-- Add sample events (future dates)
INSERT INTO events (title, description, start_time, end_time, location, capacity) VALUES
('Women in Leadership Workshop',
 'Join us for an empowering workshop on leadership skills and professional development. Learn from successful women leaders and network with peers.',
 '2025-03-15 18:00:00',
 '2025-03-15 20:00:00',
 '123 Community Center, Provo',
 50),

('Monthly Support Group',
 'A safe space to connect, share experiences, and support each other. Open to all women in our community.',
 '2025-03-20 19:00:00',
 '2025-03-20 21:00:00',
 'Ella Rises Community Room',
 20),

('Career Development Seminar',
 'Learn about career opportunities, resume building, and networking strategies. Includes guest speakers from various industries.',
 '2025-04-05 17:30:00',
 '2025-04-05 19:30:00',
 'Virtual Event (Zoom)',
 100),

('Self-Care & Wellness Workshop',
 'Explore techniques for stress management, mindfulness, and maintaining work-life balance.',
 '2025-04-12 18:30:00',
 '2025-04-12 20:30:00',
 '456 Wellness Center, Orem',
 30),

('Financial Literacy for Women',
 'Learn about budgeting, investing, and planning for your financial future with expert financial advisors.',
 '2025-04-20 18:00:00',
 '2025-04-20 20:00:00',
 'Downtown Library Conference Room',
 40),

('Networking Mixer',
 'Connect with other women professionals in a casual, supportive environment. Light refreshments provided.',
 '2025-05-02 18:00:00',
 '2025-05-02 21:00:00',
 'Rooftop Lounge, City Center',
 60);

-- Register some users for events
INSERT INTO event_registrations (user_id, event_id, created_at) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '5 days'),
(2, 2, CURRENT_TIMESTAMP - INTERVAL '3 days'),
(3, 1, CURRENT_TIMESTAMP - INTERVAL '4 days'),
(3, 3, CURRENT_TIMESTAMP - INTERVAL '2 days'),
(4, 2, CURRENT_TIMESTAMP - INTERVAL '6 days'),
(5, 1, CURRENT_TIMESTAMP - INTERVAL '7 days'),
(5, 3, CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Assign some milestones to participants
INSERT INTO participant_milestones (user_id, milestone_id, achieved_at) VALUES
(2, 4, CURRENT_TIMESTAMP - INTERVAL '180 days'),  -- Middle School Diploma
(2, 10, CURRENT_TIMESTAMP - INTERVAL '30 days'),  -- High School Diploma
(3, 4, CURRENT_TIMESTAMP - INTERVAL '200 days'),  -- Middle School Diploma
(3, 10, CURRENT_TIMESTAMP - INTERVAL '60 days'),  -- High School Diploma
(4, 4, CURRENT_TIMESTAMP - INTERVAL '150 days'),  -- Middle School Diploma
(5, 4, CURRENT_TIMESTAMP - INTERVAL '190 days'),  -- Middle School Diploma
(5, 5, CURRENT_TIMESTAMP - INTERVAL '10 days');   -- Internship

-- Add sample donations (some with donation_date, some without)
INSERT INTO donations (user_id, amount, donor_name, donor_email, donation_date, created_at) VALUES
(2, 50.00, 'Jane Doe', 'jane.doe@example.com', '2025-01-15 10:00:00', CURRENT_TIMESTAMP - INTERVAL '45 days'),
(3, 25.00, 'Sarah Johnson', 'sarah.johnson@example.com', NULL, CURRENT_TIMESTAMP - INTERVAL '30 days'),  -- No donation_date specified
(5, 100.00, 'Maria Garcia', 'maria.garcia@example.com', '2025-02-01 14:30:00', CURRENT_TIMESTAMP - INTERVAL '15 days'),
(NULL, 75.00, 'Anonymous Donor', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '10 days'),  -- Anonymous, no date
(4, 30.00, 'Emily Chen', 'emily.chen@example.com', '2025-02-10 09:00:00', CURRENT_TIMESTAMP - INTERVAL '5 days');

-- Add sample programs
INSERT INTO programs (title, description, age_range, schedule, fee, additional_info) VALUES
('Ballet Folklorico',
 'Experience the vibrant culture and traditions of Mexican folk dance. Learn authentic choreography, develop performance skills, and connect with your heritage through movement and music.',
 'Girls ages 11-18 years old',
 'Mondays at 7:00 PM',
 NULL,
 'Auditions for 2026 begin in May. No prior dance experience required - just bring your enthusiasm and willingness to learn!'),

('Summit + Educational Pathways',
 'Day camp packed with activities to give a glimpse of the Ella Rises Experience: art, STEM, and a focus on education! Conclude the day camp with a tour of a local university or technical college.',
 'Girls ages 11-18 years old',
 'Summer day camp - dates announced in spring',
 NULL,
 'This immersive day experience combines hands-on learning with college exploration. Limited spots available - register early!'),

('Mariachi',
 'Music class for violin, trumpet, guitarrón, vihuela, and guitar. Learn traditional Mexican music in a supportive, culturally-rich environment.',
 'Girls ages 11-18',
 'Mondays from 5:30 PM - 6:45 PM',
 45.00,
 'Annual program fee: $45 (Venmo or cash). Instruments provided for use during class. No prior musical experience necessary.');

-- Enroll some users in programs
INSERT INTO program_enrollments (user_id, program_id, enrolled_at, status) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '90 days', 'active'),
(3, 1, CURRENT_TIMESTAMP - INTERVAL '85 days', 'active'),
(3, 3, CURRENT_TIMESTAMP - INTERVAL '70 days', 'active'),
(4, 2, CURRENT_TIMESTAMP - INTERVAL '60 days', 'active'),
(5, 3, CURRENT_TIMESTAMP - INTERVAL '50 days', 'active');

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
SELECT 'programs', COUNT(*) FROM programs
UNION ALL
SELECT 'program_enrollments', COUNT(*) FROM program_enrollments
UNION ALL
SELECT 'surveys', COUNT(*) FROM surveys
UNION ALL
SELECT 'milestones', COUNT(*) FROM milestones
UNION ALL
SELECT 'participant_milestones', COUNT(*) FROM participant_milestones
UNION ALL
SELECT 'donations', COUNT(*) FROM donations
UNION ALL
SELECT 'event_templates', COUNT(*) FROM event_templates;

-- Show all users (without password hashes)
SELECT id, email, name, role, login_count, created_at FROM users ORDER BY id;

-- Show all milestones
SELECT id, title, category FROM milestones ORDER BY id;

-- Show all events
SELECT id, title, start_time, location, capacity FROM events ORDER BY start_time;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT '✓ Database setup complete! Ready for deployment.' as message;
SELECT 'Admin Login: admin@ellarises.org / admin123' as credentials;
SELECT 'Sample Users: participant123 (password for all sample users)' as info;
