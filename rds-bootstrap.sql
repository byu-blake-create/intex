-- ===========================================================
-- RDS BOOTSTRAP: Ella Rises schema + required columns/data
-- Run once on the EB Postgres instance (ebdb).
-- Usage:
--   export PGPASSWORD="YOUR_RDS_PASSWORD"
--   psql -h $RDS_HOST -U postgres -d ebdb -f rds-bootstrap.sql
-- ===========================================================

-- Drop existing objects (careful in production)
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

DROP FUNCTION IF EXISTS update_user_total_donations() CASCADE;

-- ======================
-- Core tables
-- ======================

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
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE event_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  description TEXT,
  recurrence_pattern VARCHAR(50),
  default_capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
CREATE INDEX idx_events_start_time ON events(start_time);

CREATE TABLE event_registrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, event_id)
);

CREATE TABLE surveys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  registration_id INTEGER REFERENCES event_registrations(id) ON DELETE CASCADE,
  satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
  usefulness_rating INTEGER CHECK (usefulness_rating BETWEEN 1 AND 5),
  instructor_rating INTEGER CHECK (instructor_rating BETWEEN 1 AND 5),
  recommendation_rating INTEGER CHECK (recommendation_rating BETWEEN 1 AND 5),
  overall_score NUMERIC(3,2),
  net_promoter_score VARCHAR(20) CHECK (net_promoter_score IN ('Promoter', 'Passive', 'Detractor')),
  additional_feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_surveys_user ON surveys(user_id);
CREATE INDEX idx_surveys_event ON surveys(event_id);

CREATE TABLE milestones (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participant_milestones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  custom_title VARCHAR(255),
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  UNIQUE(user_id, program_id)
);

-- Donations (with donation_date, nullable)
CREATE TABLE donations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  donation_number INTEGER,
  donor_name VARCHAR(255),
  donor_email VARCHAR(255),
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  donation_date TIMESTAMP NULL
);
CREATE INDEX idx_donations_user ON donations(user_id);

-- ======================
-- Trigger to keep total_donations updated
-- ======================
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

CREATE TRIGGER trigger_update_total_donations
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW
EXECUTE FUNCTION update_user_total_donations();

-- ======================
-- Seed data
-- ======================

-- Admin user (password = admin123)
INSERT INTO users (email, name, password_hash, role) VALUES
('admin@ellarises.org', 'Admin User', '$2a$10$dCwAFOvD0JYo3i/ztF2dxOxltLa.u6l8mYBx2b2jHmeeBEH3q8jGS', 'admin');

-- Sample participants (password = participant123)
INSERT INTO users (email, name, password_hash, role, city, state, field_of_interest) VALUES
('jane.doe@example.com', 'Jane Doe', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Provo', 'UT', 'Education'),
('sarah.johnson@example.com', 'Sarah Johnson', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Orem', 'UT', 'Business'),
('emily.chen@example.com', 'Emily Chen', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Spanish Fork', 'UT', 'Technology'),
('maria.garcia@example.com', 'Maria Garcia', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Springville', 'UT', 'Arts');

-- Milestone categories (from provided CSV)
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

-- Sample future events (optional; safe to remove if not needed)
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
 '2025-04-10 18:30:00',
 '2025-04-10 20:30:00',
 'Provo Library Auditorium',
 60);

-- Note: donation_date is nullable and used by the app; no default backfill is set here.
-- After importing real data, set donations.donation_date from your CSV (as we did locally).
