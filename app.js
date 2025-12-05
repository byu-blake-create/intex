// ============================================
// ELLA RISES WEB APPLICATION
// ============================================
// A full-stack Node.js/Express application for Ella Rises organization
// Built with: Express, EJS, Knex, PostgreSQL, express-session, bcrypt

// Load environment variables from .env file (development only)
// In production (Elastic Beanstalk), variables come from EB Configuration
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ============================================
// DEPENDENCIES
// ============================================
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// ============================================
// KNEX DATABASE SETUP
// ============================================
// Configure Knex to connect to PostgreSQL
// Connection details come from environment variables
// Supports both local development and AWS RDS deployment
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.RDS_HOSTNAME || process.env.DB_HOST || 'localhost',
    user: process.env.RDS_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.RDS_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    database: process.env.RDS_DB_NAME || process.env.DB_NAME || 'ella_rises',
    port: process.env.RDS_PORT || process.env.DB_PORT || 5432,
    // SSL configuration for AWS RDS
    ssl: (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production')
      ? { rejectUnauthorized: false }
      : false,
  },
});

// Test database connection on startup
knex.raw('SELECT 1')
  .then(() => {
    console.log('✅ Database connected successfully');
    console.log(`   Host: ${process.env.RDS_HOSTNAME || process.env.DB_HOST || 'localhost'}`);
    console.log(`   Database: ${process.env.RDS_DB_NAME || process.env.DB_NAME || 'ella_rises'}`);
  })
  .catch((err) => {
    console.error('❌ Database connection failed:');
    console.error(`   Error: ${err.message}`);
    console.error(`   Host: ${process.env.RDS_HOSTNAME || process.env.DB_HOST || 'localhost'}`);
    console.error(`   Database: ${process.env.RDS_DB_NAME || process.env.DB_NAME || 'ella_rises'}`);
    console.error('   Please check your database configuration and environment variables.');
  });

// ============================================
// HELPER FUNCTIONS
// ============================================

// Validate and clamp page number to valid range
function validatePageNumber(requestedPage, totalPages) {
  const page = parseInt(requestedPage) || 1;

  // Clamp to valid range (1 to totalPages)
  if (page < 1) return 1;
  if (totalPages > 0 && page > totalPages) return totalPages;
  return page;
}

// Expected database schema (for reference):
//
// participants table:
//   - id (primary key)
//   - participant_first_name (string)
//   - participant_last_name (string)
//   - participant_email (string, unique)
//   - participant_password (string)
//   - participant_role (string: 'participant' or 'admin')
//   - login_count (integer, default 0)
//   - created_at (timestamp)
//
// event_occurance table (app refers to this as 'events'):
//   - event_occurance_id (primary key)
//   - event_name (foreign key to events.event_name)
//   - event_date_time_start (timestamp)
//   - event_date_time_end (timestamp)
//   - event_location (string)
//   - event_capacity (integer)
//   - event_registration_deadline (timestamp)
//   - image_url (string)
//   - created_at (timestamp)
//
// event_registrations table: (REMOVED - merged into 'registration' table)
//
// surveys table (now 'registration' table):
//   - registration_id (primary key)
//   - participant_id (foreign key to participants.id)
//   - event_occurance_id (foreign key to event_occurance.event_occurance_id)
//   - attendance_id (foreign key to attendance.attendance_id)
//   - registration_check_in_time (timestamp)
//   - registration_created_at (timestamp)
//   - survey_satisfaction_score (integer)
//   - survey_usefulness_score (integer)
//   - survey_instructor_score (integer)
//   - survey_recommendation_score (integer)
//   - survey_overall_score (numeric)
//   - survey_nps_bucket (string)
//   - survey_comments (text)
//   - survey_submission_date (timestamp)
//
// milestone table (combined from old milestones and participant_milestones):
//   - milestone_id (primary key)
//   - participant_id (foreign key to participants.id)
//   - milestone_title (string)
//   - milestone_category (string)
//   - milestone_date (timestamp)
//
// donations table:
//   - donation_id (primary key)
//   - participant_id (foreign key to participants.id, nullable for anonymous donations)
//   - donation_date (timestamp)
//   - donation_amount (decimal)
//   - donation_number (integer)
//   - created_at (timestamp)



// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ============================================
// EMAIL (NODEMAILER) SETUP
// ============================================
// Configure a reusable transporter for contact form submissions.
// Supports both local SMTP and Amazon SES
const mailTransporter =
  process.env.MAIL_HOST && (process.env.MAIL_FROM || process.env.MAIL_USER)
    ? nodemailer.createTransport({
        host: process.env.MAIL_HOST, // For AWS SES: email-smtp.{region}.amazonaws.com
        port: parseInt(process.env.MAIL_PORT, 10) || 587,
        secure:
          process.env.MAIL_SECURE === 'true' ||
          parseInt(process.env.MAIL_PORT, 10) === 465,
        auth:
          process.env.MAIL_USER && process.env.MAIL_PASS
            ? {
                user: process.env.MAIL_USER, // AWS SES SMTP username
                pass: process.env.MAIL_PASS, // AWS SES SMTP password
              }
            : undefined,
        // Additional settings for AWS SES
        tls: {
          // Do not fail on invalid certificates (for self-signed certs in dev)
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      })
    : null;

// ============================================
// MULTER FILE UPLOAD SETUP
// ============================================
// Configure storage for event images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'images', 'events');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to only accept images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: fileFilter
});

// ============================================
// I18N SETUP (EN/ES)
// ============================================
const localesDir = path.join(__dirname, 'locales');
const defaultLocale = 'en';

function loadLocale(lang) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Error parsing locale file for ${lang}:`, err);
      return null;
    }
  }
  return null;
}

const localeCache = {
  en: loadLocale('en') || {},
  es: loadLocale('es') || {},
};

function translate(lang, key) {
  const locale = localeCache[lang] || localeCache[defaultLocale];
  const fallback = localeCache[defaultLocale] || {};
  return (locale && locale[key]) || fallback[key] || key;
}

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

// Parse URL-encoded bodies (from forms)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static files from /public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration for user authentication
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ella-rises-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// Make user data available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isLoggedIn = !!req.session.user;
  res.locals.isAdmin = req.session.user && req.session.user.role === 'admin';
  next();
});

// Locale detection & translation helper
app.use((req, res, next) => {
  // Override via query ?lang=es|en
  const qLang = req.query.lang && ['en', 'es'].includes(req.query.lang) ? req.query.lang : null;

  if (qLang) {
    req.session.locale = qLang;
  }

  // Session locale takes precedence, else detect from Accept-Language
  let activeLocale = req.session.locale;
  if (!activeLocale) {
    const header = req.headers['accept-language'] || '';
    const prefersSpanish = header.toLowerCase().startsWith('es');
    activeLocale = prefersSpanish ? 'es' : defaultLocale;
    req.session.locale = activeLocale;
  }

  res.locals.locale = activeLocale;
  res.locals.t = (key) => translate(activeLocale, key);
  const switchTo = activeLocale === 'es' ? 'en' : 'es';
  res.locals.langSwitchHref = `${req.path}?lang=${switchTo}`;
  res.locals.langSwitchLabel = switchTo === 'es' ? 'Español' : 'English';
  next();
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

// Middleware to protect routes - user must be logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Middleware to protect admin-only routes
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin privileges required.');
  }
  next();
}

// ============================================
// PUBLIC ROUTES
// ============================================

// Landing page - Public facing, styled like ellarises.org
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Home - Ella Rises',
  });
});

// About page
const leadershipTeam = [
  {
    name: 'Nadia Cates',
    role: 'Founder & Executive Director',
    image: '/images/about/Nadia Cates.jpeg',
  },
  {
    name: 'Claudia Barillas',
    role: 'Program Director',
    image: '/images/about/Claudia ER Portrait.jpg',
  },
];

const boardMembers = [
  { name: 'Emma Guapo', role: 'Chair of the Board', image: '/images/about/Emma 01_JPG.jpg' },
  { name: 'Dennia Gayle', role: 'Vice Chair', image: '/images/about/WhatsApp Image 2025-09-17 at 09_24_16.jpeg' },
  { name: 'Bert Barillas', role: 'Secretary', image: '/images/about/Bert portrait.jpg' },
  { name: 'Rogelio Osuna', role: 'Treasurer', image: '/images/about/Rogelio 01.jpg' },
  { name: 'Zachariah Parry', role: 'Board Member', image: '/images/about/Zach-Headshot.jpg' },
  { name: 'Shawn Cates', role: 'Board Member', image: '/images/about/Shawn portrait_JPG.jpg' },
  { name: 'Kathy Larrabee', role: 'Board Member', image: '/images/about/Kathy Larrabee.jpg' },
  { name: 'Rick Heizer', role: 'Board Member', image: '/images/about/Rick Heizer.jpg' },
];

app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About - Ella Rises',
    leadershipTeam,
    boardMembers,
  });
});

// Contact page - mirrors Ella Rises contact form
app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us - Ella Rises',
    status: null,
    formData: {},
  });
});

// Handle contact form submission
app.post('/contact', async (req, res) => {
  const { topic, firstName, lastName, email, message, phone } = req.body;

  const errors = [];
  if (!topic) errors.push('Please select how you want to engage.');
  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (!email) errors.push('Email is required.');
  if (!message) errors.push('Message is required.');
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailPattern.test(email)) {
    errors.push('Please enter a valid email address.');
  }
  if (!mailTransporter) {
    errors.push('Email is not configured. Please try again later.');
  }

  if (errors.length > 0) {
    return res.status(400).render('contact', {
      title: 'Contact Us - Ella Rises',
      status: { success: false, message: errors.join(' ') },
      formData: { topic, firstName, lastName, email, message, phone },
    });
  }

  try {
    const sender =
      process.env.MAIL_FROM || process.env.MAIL_USER || 'no-reply@localhost';
    const recipient = process.env.MAIL_TO || sender;

    await mailTransporter.sendMail({
      from: sender,
      to: recipient,
      replyTo: email,
      subject: `[Ella Rises] ${topic} - ${firstName} ${lastName}`,
      text: `
Topic: ${topic}
Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone || 'Not provided'}

Message:
${message}
      `.trim(),
      html: `
        <p><strong>Topic:</strong> ${topic}</p>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
    });

    res.render('contact', {
      title: 'Contact Us - Ella Rises',
      status: { success: true, message: 'Thanks for reaching out! We will be in touch soon.' },
      formData: {},
    });
  } catch (error) {
    console.error('Error sending contact email:', error);
    res.status(500).render('contact', {
      title: 'Contact Us - Ella Rises',
      status: { success: false, message: 'There was a problem sending your message. Please try again.' },
      formData: { topic, firstName, lastName, email, message, phone },
    });
  }
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Show login page
app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - Ella Rises',
    error: null,
  });
});

// Handle login form submission
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await knex('participants').where({ participant_email: email }).first();

    if (!user) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Compare password with hashed password
    const passwordMatch = await bcrypt.compare(password, user.participant_password);

    if (!passwordMatch) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Increment login count
    await knex('participants')
      .where({ id: user.id })
      .increment('login_count', 1);

    // Store user in session (don't store password_hash)
    req.session.user = {
      id: user.id,
      name: `${user.participant_first_name} ${user.participant_last_name}`,
      email: user.participant_email,
      role: user.participant_role,
    };

    // Redirect based on role
    if (user.participant_role === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/user/dashboard');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', {
      title: 'Login - Ella Rises',
      error: 'An error occurred. Please try again.',
    });
  }
});

// Show signup page
app.get('/signup', (req, res) => {
  res.render('signup', {
    title: 'Sign Up - Ella Rises',
    error: null,
    req,
  });
});

// Handle signup form submission
app.post('/signup', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    dob,
    city,
    state,
    zip,
    schoolOrEmployer,
    fieldOfInterest,
    password,
    confirmPassword
  } = req.body;

  try {
    // Validate passwords match
    if (password !== confirmPassword) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'Passwords do not match',
      });
    }

    // Check if user already exists
    const existingUser = await knex('participants').where({ participant_email: email }).first();

    if (existingUser) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'An account with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 10;
    const participant_password = await bcrypt.hash(password, saltRounds);

    // Insert new participant
    const [newUser] = await knex('participants')
      .insert({
        participant_first_name: firstName,
        participant_last_name: lastName,
        participant_email: email,
        participant_phone: phone,
        participant_dob: dob,
        participant_city: city,
        participant_state: state,
        participant_zip: zip,
        participant_school_or_employer: schoolOrEmployer,
        participant_field_of_interest: fieldOfInterest,
        participant_password: participant_password,
        participant_role: 'participant',
      })
      .returning('*');

    // Log the participant in immediately
    req.session.user = {
      id: newUser.id,
      name: `${newUser.participant_first_name} ${newUser.participant_last_name}`,
      email: newUser.participant_email,
      role: newUser.participant_role,
    };

    res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', {
      title: 'Sign Up - Ella Rises',
      error: 'An error occurred. Please try again. Details: ' + error.message,
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// ============================================
// EVENTS ROUTES (Public + User)
// ============================================

// Events list page - shows all upcoming events
// This page is publicly accessible (no login required to view)
app.get('/events', async (req, res) => {
  try {
    // Get only future events from database, ordered by event_date_time_start
    const events = await knex('event_occurance')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'event_occurance.event_occurance_id',
        'event_occurance.event_date_time_start',
        'event_occurance.event_date_time_end',
        'event_occurance.event_location',
        'event_occurance.event_capacity',
        'event_occurance.image_url',
        'events.event_description as description',
        'events.event_name as title'
      )
      .where('event_occurance.event_date_time_start', '>=', new Date())
      .orderBy('event_occurance.event_date_time_start', 'asc');

    res.render('events/index', {
      title: 'Events - Ella Rises',
      events,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).send('Error loading events');
  }
});

// Event detail page - shows details for a specific event
// Public viewing, but sign-up requires login
app.get('/events/:eventId', async (req, res) => {
  const { eventId } = req.params;

  try {
    // Get the specific event
    const event = await knex('event_occurance')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'event_occurance.event_occurance_id',
        'event_occurance.event_name',
        'event_occurance.event_date_time_start',
        'event_occurance.event_date_time_end',
        'event_occurance.event_location',
        'event_occurance.event_capacity',
        'event_occurance.event_registration_deadline',
        'event_occurance.image_url',
        'events.event_description as description',
        'events.event_name as title'
      )
      .where('event_occurance.event_occurance_id', eventId)
      .first();

    if (!event) {
      return res.status(404).send('Event not found');
    }

    // Check if current user is already registered (if logged in)
    let isRegistered = false;
    if (req.session.user) {
      const registration = await knex('registration')
        .where({
          participant_id: req.session.user.id,
          event_occurance_id: eventId,
        })
        .first();

      isRegistered = !!registration;
    }

    // Check if event is in the past
    const isPast = new Date(event.event_date_time_start) < new Date();

    res.render('events/detail', {
      title: `${event.title} - Ella Rises`,
      event,
      isRegistered,
      isPast,
      req,
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).send('Error loading event');
  }
});

// Event sign-up - user registers for an event
// Requires login
app.post('/events/:eventId/signup', requireLogin, async (req, res) => {
  const { eventId } = req.params;
  const userId = req.session.user.id;

  try {
    // Get the event to check if it's in the past
    const event = await knex('event_occurance')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .select('event_occurance.*', 'events.event_description as description', 'events.event_name as title')
      .where('event_occurance.event_occurance_id', eventId)
      .first();

    if (!event) {
      return res.status(404).send('Event not found');
    }

    // Prevent signup for past events
    if (new Date(event.event_date_time_start) < new Date()) {
      return res.redirect(`/events/${eventId}?message=event_past`);
    }

    // Check if already registered
    const existing = await knex('registration')
      .where({
        participant_id: userId,
        event_occurance_id: eventId,
      })
      .first();

    if (existing) {
      return res.redirect(`/events/${eventId}?message=already_registered`);
    }

    // Check event capacity if specified
    if (event.event_capacity) {
      const [{ count: currentRegistrations }] = await knex('registration')
        .where({ event_occurance_id: eventId })
        .count('* as count');

      if (parseInt(currentRegistrations) >= event.event_capacity) {
        return res.redirect(`/events/${eventId}?message=event_full`);
      }
    }

    // Insert registration
    await knex('registration').insert({
      participant_id: userId,
      event_occurance_id: eventId,
      registration_created_at: new Date(),
    });

    // Send confirmation email to user
    try {
      const eventDate = new Date(event.event_date_time_start);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const formattedTime = eventDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      await mailTransporter.sendMail({
        from: process.env.MAIL_FROM,
        to: req.session.user.email,
        subject: `Registration Confirmed: ${event.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Event Registration Confirmation</h2>
            <p>Hi ${req.session.user.name},</p>
            <p>You're all set! You've successfully registered for:</p>

            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #e91e63; margin-top: 0;">${event.title}</h3>
              <p style="margin: 10px 0;"><strong>Date:</strong> ${formattedDate}</p>
              <p style="margin: 10px 0;"><strong>Time:</strong> ${formattedTime}</p>
              ${event.event_location ? `<p style="margin: 10px 0;"><strong>Location:</strong> ${event.event_location}</p>` : ''}
            </div>

            ${event.description ? `<p>${event.description}</p>` : ''}

            <p>We look forward to seeing you there!</p>

            <p style="margin-top: 30px; color: #7f8c8d; font-size: 14px;">
              If you have any questions, please contact us through our website.
            </p>

            <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
            <p style="color: #95a5a6; font-size: 12px;">
              This is an automated confirmation from Ella Rises. Please do not reply to this email.
            </p>
          </div>
        `,
      });
      console.log(`Confirmation email sent to ${req.session.user.email} for event ${event.title}`);
    } catch (emailError) {
      // Log email error but don't fail the registration
      console.error('Error sending confirmation email:', emailError);
      // Registration still succeeded, just email failed
    }

    res.redirect(`/events/${eventId}?message=signup_success`);
  } catch (error) {
    console.error('Error signing up for event:', error);
    res.redirect(`/events/${eventId}?message=error`);
  }
});

// ============================================
// PROGRAMS ROUTES (Public + User)
// ============================================

// Programs list page - view all programs
app.get('/programs', async (req, res) => {
  try {
    const programs = await knex('programs')
      .select('*')
      .orderBy('title', 'asc');

    let isEnrolled = {};
    if (req.session && req.session.user) {
      const enrollments = await knex('program_enrollments')
        .where('user_id', req.session.user.id)
        .select('program_id');

      enrollments.forEach(e => {
        isEnrolled[e.program_id] = true;
      });
    }

    res.render('programs/list', {
      title: 'Programs - Ella Rises',
      programs,
      isEnrolled,
    });
  } catch (error) {
    console.error('Error loading programs:', error);
    res.status(500).send('Error loading programs');
  }
});

// Program detail page
app.get('/programs/:programId', async (req, res) => {
  const { programId } = req.params;

  try {
    const program = await knex('programs')
      .where('id', programId)
      .first();

    if (!program) {
      return res.status(404).send('Program not found');
    }

    let isEnrolled = false;
    if (req.session && req.session.user) {
      const enrollment = await knex('program_enrollments')
        .where({
          user_id: req.session.user.id,
          program_id: programId,
        })
        .first();

      isEnrolled = !!enrollment;
    }

    res.render('programs/detail', {
      title: `${program.title} - Ella Rises`,
      program,
      isEnrolled,
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).send('Error loading program');
  }
});

// Program enrollment - user enrolls in a program
app.post('/programs/:programId/enroll', requireLogin, async (req, res) => {
  const { programId } = req.params;
  const userId = req.session.user.id;

  try {
    // Check if already enrolled
    const existing = await knex('program_enrollments')
      .where({
        user_id: userId,
        program_id: programId,
      })
      .first();

    if (existing) {
      return res.redirect(`/programs/${programId}?message=already_enrolled`);
    }

    // Insert enrollment
    await knex('program_enrollments').insert({
      user_id: userId,
      program_id: programId,
      enrolled_at: new Date(),
      status: 'active',
    });

    res.redirect(`/programs/${programId}?message=enrollment_success`);
  } catch (error) {
    console.error('Error enrolling in program:', error);
    res.redirect(`/programs/${programId}?message=error`);
  }
});

// ============================================
// VISITOR DONATIONS (PUBLIC)
// ============================================

// Public donation form page
app.get('/donate', (req, res) => {
  res.render('donate', {
    title: 'Make a Donation - Ella Rises',
    success: req.query.success,
    error: null,
  });
});

// Handle donation submission (public - no login required)
app.post('/donate', async (req, res) => {
  const { amount, message } = req.body; // donor_name and donor_email removed

  try {
    // Validate amount
    const donationAmount = parseFloat(amount);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      return res.render('donate', {
        title: 'Make a Donation - Ella Rises',
        error: 'Please enter a valid donation amount',
        success: null,
      });
    }

    // Insert donation (participant_id is null for visitor donations)
    await knex('donations').insert({
      participant_id: null, // user_id changed to participant_id
      donation_amount: donationAmount, // amount changed to donation_amount
      donation_date: new Date(), // Add donation_date
      donation_number: null, // donation_number not from form
      message: message || null,
      created_at: new Date(), // Explicitly setting created_at
    });

    res.redirect('/donate?success=true');
  } catch (error) {
    console.error('Error processing donation:', error);
    res.render('donate', {
      title: 'Make a Donation - Ella Rises',
      error: 'An error occurred while processing your donation. Please try again.',
      success: null,
    });
  }
});

// ============================================
// USER ROUTES (Normal Users)
// ============================================

// User dashboard
app.get('/user/dashboard', requireLogin, async (req, res) => {
  try {
    // Get user's registered events
    const registeredEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .select('event_occurance.*', 'events.event_description as description', 'events.event_name as title', 'registration.registration_created_at as registered_at')
      .orderBy('event_occurance.event_date_time_start', 'asc');

    // Get user's milestones
    const userMilestones = await knex('milestone')
      .where('milestone.participant_id', req.session.user.id)
      .select(
        'milestone.milestone_id',
        'milestone.milestone_title',
        'milestone.milestone_category',
        'milestone.milestone_date as achieved_at' // Alias for consistency with template
      )
      .orderBy('milestone.milestone_date', 'desc');

    // Get user's enrolled programs
    const enrolledPrograms = await knex('program_enrollments')
      .join('programs', 'program_enrollments.program_id', 'programs.id')
      .where('program_enrollments.user_id', req.session.user.id)
      .select('programs.*', 'program_enrollments.enrolled_at', 'program_enrollments.status')
      .orderBy('program_enrollments.enrolled_at', 'desc');

    res.render('user/dashboard', {
      title: 'My Rise - Ella Rises',
      registeredEvents,
      userMilestones,
      enrolledPrograms,
    });
  } catch (error) {
    console.error('Error loading user dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// User's account page - view and edit profile
app.get('/user/account', requireLogin, async (req, res) => {
  try {
    const user = await knex('participants')
      .where('id', req.session.user.id)
      .first();

    res.render('user/account', {
      title: 'Account Details - Ella Rises',
      user,
      success: null,
      error: null,
    });
  } catch (error) {
    console.error('Error loading account page:', error);
    res.status(500).send('Error loading account page');
  }
});

// User's account page - update profile
app.post('/user/account', requireLogin, async (req, res) => {
  const { first_name, last_name, email, phone, city, state, zip, school_or_employer, field_of_interest } = req.body;

  try {
    const user = await knex('participants')
      .where('id', req.session.user.id)
      .first();

    // Check if email is being changed and if it's already in use by another user
    if (email !== user.participant_email) {
      const existingUser = await knex('participants')
        .where('participant_email', email)
        .whereNot('id', req.session.user.id)
        .first();

      if (existingUser) {
        const userData = await knex('participants')
          .where('id', req.session.user.id)
          .first();

        return res.render('user/account', {
          title: 'Account Details - Ella Rises',
          user: userData,
          success: null,
          error: 'This email is already in use by another account.',
        });
      }
    }

    // Update user information
    await knex('participants')
      .where('id', req.session.user.id)
      .update({
        participant_first_name: first_name,
        participant_last_name: last_name,
        participant_email: email,
        participant_phone: phone,
        participant_city: city,
        participant_state: state,
        participant_zip: zip,
        participant_school_or_employer: school_or_employer,
        participant_field_of_interest: field_of_interest,
      });

    // Update session with new name and email
    req.session.user.name = `${first_name} ${last_name || ''}`.trim();
    req.session.user.email = email;

    // Get updated user data
    const updatedUser = await knex('participants')
      .where('id', req.session.user.id)
      .first();

    res.render('user/account', {
      title: 'Account Details - Ella Rises',
      user: updatedUser,
      success: 'Your account has been updated successfully!',
      error: null,
    });
  } catch (error) {
    console.error('Error updating account:', error);

    const userData = await knex('participants')
      .where('id', req.session.user.id)
      .first();

    res.render('user/account', {
      title: 'Account Details - Ella Rises',
      user: userData,
      success: null,
      error: 'An error occurred while updating your account. Please try again.',
    });
  }
});

// User's events page
app.get('/user/events', requireLogin, async (req, res) => {
  try {
    const registeredEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .select('event_occurance.*', 'events.event_description as description', 'events.event_name as title', 'registration.registration_created_at as registered_at')
      .orderBy('event_occurance.event_date_time_start', 'asc');

    res.render('user/events', {
      title: 'My Events - Ella Rises',
      events: registeredEvents,
    });
  } catch (error) {
    console.error('Error loading user events:', error);
    res.status(500).send('Error loading events');
  }
});

// User's milestones page
app.get('/user/milestones', requireLogin, async (req, res) => {
  try {
    // Get user data
    const user = await knex('participants')
      .where('id', req.session.user.id)
      .first();

    // Add name field for view
    if (user) {
      user.name = `${user.participant_first_name} ${user.participant_last_name || ''}`.trim();
    }

    const userMilestones = await knex('milestone')
      .where('milestone.participant_id', req.session.user.id)
      .select(
        'milestone.milestone_id',
        'milestone.milestone_title',
        'milestone.milestone_category',
        'milestone.milestone_date',
      )
      .orderBy('milestone.milestone_date', 'desc');

    // Get all distinct milestone categories for the dropdown
    const milestoneCategories = await knex('milestone')
      .distinct('milestone_category')
      .whereNotNull('milestone_category')
      .orderBy('milestone_category', 'asc');

    res.render('user/milestones', {
      title: 'My Milestones - Ella Rises',
      user,
      milestones: userMilestones,
      categories: milestoneCategories,
      req,
    });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).send('Error loading milestones');
  }
});

// User's donation history page
// This route fetches and displays a list of all donations made by the currently logged-in user.
app.get('/user/donations', requireLogin, async (req, res) => {
  try {
    const userDonations = await knex('donations')
      .where('participant_id', req.session.user.id)
      .orderBy('donation_date', 'desc');

    // Convert donation_amount to a number for correct display
    const donations = userDonations.map(donation => {
      return {
        ...donation,
        donation_amount: Number(donation.donation_amount)
      };
    });

    res.render('user/donations', {
      title: 'My Donations - Ella Rises',
      donations: donations,
    });
  } catch (error) {
    console.error('Error loading user donations:', error);
    res.status(500).send('Error loading donation history');
  }
});

// User's survey history page
// This route fetches and displays all survey responses submitted by the logged-in user.
app.get('/user/surveys', requireLogin, async (req, res) => {
  try {
    const userSurveys = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .whereNotNull('registration.survey_submission_date')
      .select(
        'registration.*',
        'events.event_name as event_title'
      )
      .orderBy('registration.survey_submission_date', 'desc');

    res.render('user/surveys', {
      title: 'My Survey History - Ella Rises',
      surveys: userSurveys,
    });
  } catch (error) {
    console.error('Error loading user surveys:', error);
    res.status(500).send('Error loading survey history');
  }
});

// Add milestone - POST route
app.post('/user/milestones', requireLogin, async (req, res) => {
  const { milestone_title, milestone_category, milestone_date } = req.body;

  try {
    await knex('milestone').insert({
      participant_id: req.session.user.id,
      milestone_title: milestone_title,
      milestone_category: milestone_category,
      milestone_date: milestone_date ? new Date(milestone_date) : new Date(),
    });

    res.redirect('/user/milestones?success=true');
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.redirect('/user/milestones?error=true');
  }
});

// Show form to edit a milestone
// This route displays a form for a user to edit one of their own milestones.
app.get('/user/milestones/:id/edit', requireLogin, async (req, res) => {
  try {
    const milestone = await knex('milestone')
      .where({
        milestone_id: req.params.id,
        participant_id: req.session.user.id // Ensures users can only edit their own milestones.
      })
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found or you do not have permission to edit it.');
    }

    // Get all distinct milestone categories for the dropdown
    const milestoneCategories = await knex('milestone')
      .distinct('milestone_category')
      .whereNotNull('milestone_category')
      .orderBy('milestone_category', 'asc');

    res.render('user/milestone-edit-form', {
      title: 'Edit Milestone - Ella Rises',
      milestone,
      categories: milestoneCategories,
      error: null
    });
  } catch (error) {
    console.error('Error loading milestone for edit:', error);
    res.status(500).send('Error loading milestone');
  }
});

// Handle milestone update
// This route processes the submission of the milestone edit form.
app.post('/user/milestones/:id/edit', requireLogin, async (req, res) => {
  const { milestone_title, milestone_category, milestone_date } = req.body;
  try {
    // First, ensure the milestone belongs to the logged-in user before updating.
    const milestone = await knex('milestone')
      .where({
        milestone_id: req.params.id,
        participant_id: req.session.user.id
      })
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found or you do not have permission to edit it.');
    }

    // Update the milestone with the new data.
    await knex('milestone')
      .where({ milestone_id: req.params.id })
      .update({
        milestone_title,
        milestone_category,
        milestone_date: milestone_date ? new Date(milestone_date) : new Date()
      });

    res.redirect('/user/milestones?success=updated');
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.redirect('/user/milestones?error=update_failed');
  }
});

// Handle milestone delete
// This route deletes a milestone for the logged-in user.
app.post('/user/milestones/:id/delete', requireLogin, async (req, res) => {
  try {
    // Ensure the milestone belongs to the logged-in user before deleting.
    const milestone = await knex('milestone')
      .where({
        milestone_id: req.params.id,
        participant_id: req.session.user.id
      })
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found or you do not have permission to delete it.');
    }

    await knex('milestone')
      .where({ milestone_id: req.params.id })
      .del();

    res.redirect('/user/milestones?success=deleted');
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.redirect('/user/milestones?error=delete_failed');
  }
});

// Survey page - show form to submit post-event survey
app.get('/user/survey', requireLogin, async (req, res) => {
  try {
    // Get events the user has attended
    const attendedEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .select('event_occurance.*', 'events.event_name as title');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: null,
      error: null,
    });
  } catch (error) {
    console.error('Error loading survey page:', error);
    res.status(500).send('Error loading survey page');
  }
});

// Handle survey submission
app.post('/user/survey', requireLogin, async (req, res) => {
  const { event_id, satisfaction_rating, usefulness_rating, instructor_rating, recommendation_rating, additional_feedback } = req.body;

  try {
    const eventId = parseInt(event_id);
    if (isNaN(eventId)) {
      throw new Error('Invalid event selected.');
    }
    
    // Calculate overall score as average of all 4 ratings
    const sat = parseInt(satisfaction_rating);
    const use = parseInt(usefulness_rating);
    const inst = parseInt(instructor_rating);
    const rec = parseInt(recommendation_rating);
    const survey_overall_score = ((sat + use + inst + rec) / 4).toFixed(2);

    // Calculate Net Promoter Score bucket
    let survey_nps_bucket;
    if (rec <= 3) {
      survey_nps_bucket = 'Detractor';
    } else if (rec === 4) {
      survey_nps_bucket = 'Passive';
    } else {
      survey_nps_bucket = 'Promoter';
    }

    // Check if registration exists
    const existingRegistration = await knex('registration')
      .where({
        participant_id: req.session.user.id,
        event_occurance_id: eventId
      })
      .first();

    if (existingRegistration) {
      // Update existing registration with survey data
      await knex('registration')
        .where({
          participant_id: req.session.user.id,
          event_occurance_id: eventId
        })
        .update({
          survey_satisfaction_score: sat,
          survey_usefulness_score: use,
          survey_instructor_score: inst,
          survey_recommendation_score: rec,
          survey_overall_score: survey_overall_score,
          survey_nps_bucket: survey_nps_bucket,
          survey_comments: additional_feedback,
          survey_submission_date: new Date(),
        });
    } else {
      // Insert new registration with survey data (for users who weren't registered but attended)
      await knex('registration').insert({
        participant_id: req.session.user.id,
        event_occurance_id: eventId,
        survey_satisfaction_score: sat,
        survey_usefulness_score: use,
        survey_instructor_score: inst,
        survey_recommendation_score: rec,
        survey_overall_score: survey_overall_score,
        survey_nps_bucket: survey_nps_bucket,
        survey_comments: additional_feedback,
        registration_created_at: new Date(),
        survey_submission_date: new Date(),
      });
    }

    // Get events again to re-render the form
    const attendedEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .select('event_occurance.*', 'events.event_name as title');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: 'Thank you for your feedback!',
      error: null,
    });
  } catch (error) {
    console.error('Error submitting survey:', error);

    const attendedEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', req.session.user.id)
      .select('event_occurance.*', 'events.event_name as title');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: null,
      error: 'Error submitting survey. Please try again.',
    });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Admin dashboard
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    // Fetch quick stats
    const [{ count: totalUsers }] = await knex('participants').count('* as count'); // Refactored table name
    const [{ count: totalEvents }] = await knex('event_occurance').count('* as count'); // Refactored table name
    const [{ count: totalSurveys }] = await knex('registration').count('* as count'); // Refactored table name
    const [{ total: totalDonations }] = await knex('donations').sum('donation_amount as total'); // Refactored column name

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - Ella Rises',
      totalUsers: parseInt(totalUsers),
      totalEvents: parseInt(totalEvents),
      totalSurveys: parseInt(totalSurveys),
      totalDonations: parseFloat(totalDonations || 0),
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// ============================================
// ADMIN - PARTICIPANTS MANAGEMENT
// ============================================

// Admin participants list - shows all users with search/filter
app.get('/admin/participants', requireAdmin, async (req, res) => {
  try {
    const { search, page = 1 } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    let query = knex('participants').select('*');
    let countQuery = knex('participants').count('* as count');

    // Apply search filter if provided
    if (search) {
      const searchFilter = function () {
        // Check if search contains a space (searching for first + last name)
        if (search.includes(' ')) {
          const parts = search.trim().split(/\s+/); // Split by whitespace
          const firstName = parts[0];
          const lastName = parts.slice(1).join(' '); // Handle multiple words in last name

          this.where(function() {
            // Match "FirstName LastName"
            this.where(function() {
              this.where('participant_first_name', 'ilike', `%${firstName}%`)
                  .where('participant_last_name', 'ilike', `%${lastName}%`);
            })
            // OR match "LastName FirstName" (reversed order)
            .orWhere(function() {
              this.where('participant_first_name', 'ilike', `%${lastName}%`)
                  .where('participant_last_name', 'ilike', `%${firstName}%`);
            });
          })
          // OR match in email
          .orWhere('participant_email', 'ilike', `%${search}%`);
        } else {
          // Single word search - search in first name, last name, or email
          this.where('participant_first_name', 'ilike', `%${search}%`)
              .orWhere('participant_last_name', 'ilike', `%${search}%`)
              .orWhere('participant_email', 'ilike', `%${search}%`);
        }
      };
      query = query.where(searchFilter);
      countQuery = countQuery.where(searchFilter);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const users = await query.orderBy('participant_first_name', 'asc').limit(limit).offset(offset);

    res.render('admin/participants', {
      title: 'Participants - Admin - Ella Rises',
      users,
      search: search || '',
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      req,
    });
  } catch (error) {
    console.error('Error loading participants:', error);
    res.status(500).send('Error loading participants');
  }
});

// Admin - Create new user form (MUST come before /:userId routes)
app.get('/admin/participants/new/user', requireAdmin, (req, res) => {
  res.render('admin/user-form', {
    title: 'Create New User - Admin - Ella Rises',
    formUser: null,
    error: null,
  });
});

// Admin - Create new user
app.post('/admin/participants/new/user', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if user already exists
    const existingUser = await knex('participants').where({ participant_email: email }).first();

    if (existingUser) {
      return res.render('admin/user-form', {
        title: 'Create New User - Admin - Ella Rises',
        formUser: null,
        error: 'A user with this email already exists',
      });
    }

    // Split name into first and last name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null; // Join remaining parts as last name

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    await knex('participants').insert({
      participant_first_name: firstName,
      participant_last_name: lastName,
      participant_email: email,
      participant_password: hashedPassword,
      participant_role: role || 'participant',
      created_at: new Date(),
    });

    res.redirect('/admin/participants?success=created');
  } catch (error) {
    console.error('Error creating user:', error);
    res.render('admin/user-form', {
      title: 'Create New User - Admin - Ella Rises',
      formUser: null,
      error: 'Error creating user. Please try again.',
    });
  }
});

// Admin participant detail - shows comprehensive user information
app.get('/admin/participants/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    // Get user details
    const participant = await knex('participants').where({ id: userId }).first();

    if (!participant) {
      return res.status(404).send('User not found');
    }

    // Get events this user has registered for (with attendance status)
    const userEvents = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', userId)
      .select(
        'event_occurance.*',
        'events.event_name as title',
        'registration.registration_created_at as registered_at'
        // 'registration.attendance_status', // Not implemented yet
        // 'registration.registration_check_in_time' // Not implemented yet
      )
      .orderBy('event_occurance.event_date_time_start', 'desc');

    // Get enrolled programs
    const enrolledPrograms = await knex('program_enrollments')
      .join('programs', 'program_enrollments.program_id', 'programs.id')
      .where('program_enrollments.user_id', userId)
      .select('programs.*', 'program_enrollments.enrolled_at', 'program_enrollments.status')
      .orderBy('program_enrollments.enrolled_at', 'desc');

    // Get all donations by this user
    const userDonations = await knex('donations')
      .where('participant_id', userId)
      .orderBy('created_at', 'desc');

    // Get all milestones achieved
    const userMilestones = await knex('milestone')
      .where('milestone.participant_id', userId)
      .select(
        'milestone.milestone_id',
        'milestone.milestone_title',
        'milestone.milestone_category',
        'milestone.milestone_date',
      )
      .orderBy('milestone.milestone_date', 'desc');

    // Get all surveys filled out by this user
    const userSurveys = await knex('registration')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .where('registration.participant_id', userId)
      .whereNotNull('registration.survey_submission_date')
      .select('registration.*', 'events.event_name as event_title')
      .orderBy('registration.survey_submission_date', 'desc');

    res.render('admin/participantDetail', {
      title: `${participant.participant_first_name} - Participants - Admin - Ella Rises`,
      participant, // EJS template will need to be updated for this
      userEvents,
      enrolledPrograms,
      userDonations,
      userMilestones,
      userSurveys,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (error) {
    console.error('Error loading participant details:', error);
    res.status(500).send('Error loading participant details');
  }
});

// Admin - Edit user form
app.get('/admin/participants/:userId/edit', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await knex('participants').where({ id: userId }).first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.render('admin/user-form', {
      title: 'Edit User - Admin - Ella Rises',
      formUser: user,
      error: null,
    });
  } catch (error) {
    console.error('Error loading user:', error);
    res.status(500).send('Error loading user');
  }
});

// Admin - Update user
app.post('/admin/participants/:userId/edit', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { name, email, role } = req.body;

  try {
    // Check if email is taken by another user
    const existingUser = await knex('participants')
      .where({ participant_email: email })
      .whereNot({ id: userId })
      .first();

    if (existingUser) {
      const user = await knex('participants').where({ id: userId }).first();
      return res.render('admin/user-form', {
        title: 'Edit User - Admin - Ella Rises',
        formUser: user,
        error: 'This email is already in use by another user',
      });
    }

    // Split name into first and last name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;

    // Update user
    await knex('participants')
      .where({ id: userId })
      .update({
        participant_first_name: firstName,
        participant_last_name: lastName,
        participant_email: email,
        participant_role: role,
      });

    res.redirect(`/admin/participants/${userId}?success=updated`);
  } catch (error) {
    console.error('Error updating user:', error);
    const participant = await knex('participants').where({ id: userId }).first();
    res.render('admin/user-form', {
      title: 'Edit User - Admin - Ella Rises',
      formUser: participant,
      error: 'Error updating user. Please try again.',
    });
  }
});

// Admin - Change user password
app.post('/admin/participants/:userId/change-password', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { newPassword, confirmPassword } = req.body;

  try {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return res.redirect(`/admin/participants/${userId}?error=password_mismatch`);
    }

    // Validate password length
    if (!newPassword || newPassword.length < 6) {
      return res.redirect(`/admin/participants/${userId}?error=password_too_short`);
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the password
    await knex('participants')
      .where({ id: userId })
      .update({ participant_password: hashedPassword });

    res.redirect(`/admin/participants/${userId}?success=password_changed`);
  } catch (error) {
    console.error('Error changing password:', error);
    res.redirect(`/admin/participants/${userId}?error=password_change_failed`);
  }
});

// Admin - Delete user
app.post('/admin/participants/:userId/delete', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user is trying to delete themselves
    if (parseInt(userId) === req.session.user.id) {
      return res.redirect('/admin/participants?error=cannot_delete_self');
    }

    await knex('participants').where({ id: userId }).del();

    res.redirect('/admin/participants?success=deleted');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.redirect('/admin/participants?error=delete_failed');
  }
});

// ============================================
// ADMIN - MILESTONE MANAGEMENT
// ============================================

// Admin - Create new milestone form
app.get('/admin/participants/:userId/milestones/new', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const participant = await knex('participants').where({ id: userId }).first();
    if (!participant) {
      return res.status(404).send('Participant not found');
    }

    res.render('admin/milestone-form', {
      title: 'Add New Milestone - Admin - Ella Rises',
      participant,
      milestone: null,
      error: null,
    });
  } catch (error) {
    console.error('Error loading milestone form:', error);
    res.status(500).send('Error loading form');
  }
});

// Admin - Create new milestone
app.post('/admin/participants/:userId/milestones/new', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { title, category, date } = req.body;

  try {
    await knex('milestone').insert({
      participant_id: userId,
      milestone_title: title,
      milestone_category: category || null,
      milestone_date: date ? new Date(date) : new Date(),
    });

    res.redirect(`/admin/participants/${userId}?success=milestone_created`);
  } catch (error) {
    console.error('Error creating milestone:', error);
    const participant = await knex('participants').where({ id: userId }).first();
    res.render('admin/milestone-form', {
      title: 'Add New Milestone - Admin - Ella Rises',
      participant,
      milestone: null,
      error: 'Error creating milestone. Please try again.',
    });
  }
});

// Admin - Edit milestone form
app.get('/admin/participants/:userId/milestones/:milestoneId/edit', requireAdmin, async (req, res) => {
  const { userId, milestoneId } = req.params;

  try {
    const participant = await knex('participants').where({ id: userId }).first();
    if (!participant) {
      return res.status(404).send('Participant not found');
    }

    const milestone = await knex('milestone')
      .where({ milestone_id: milestoneId, participant_id: userId })
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found');
    }

    res.render('admin/milestone-form', {
      title: 'Edit Milestone - Admin - Ella Rises',
      participant,
      milestone,
      error: null,
    });
  } catch (error) {
    console.error('Error loading milestone:', error);
    res.status(500).send('Error loading milestone');
  }
});

// Admin - Update milestone
app.post('/admin/participants/:userId/milestones/:milestoneId/edit', requireAdmin, async (req, res) => {
  const { userId, milestoneId } = req.params;
  const { title, category, date } = req.body;

  try {
    await knex('milestone')
      .where({ milestone_id: milestoneId, participant_id: userId })
      .update({
        milestone_title: title,
        milestone_category: category || null,
        milestone_date: date ? new Date(date) : new Date(),
      });

    res.redirect(`/admin/participants/${userId}?success=milestone_updated`);
  } catch (error) {
    console.error('Error updating milestone:', error);
    const participant = await knex('participants').where({ id: userId }).first();
    const milestone = await knex('milestone')
      .where({ milestone_id: milestoneId, participant_id: userId })
      .first();

    res.render('admin/milestone-form', {
      title: 'Edit Milestone - Admin - Ella Rises',
      participant,
      milestone,
      error: 'Error updating milestone. Please try again.',
    });
  }
});

// Admin - Delete milestone
app.post('/admin/participants/:userId/milestones/:milestoneId/delete', requireAdmin, async (req, res) => {
  const { userId, milestoneId } = req.params;

  try {
    await knex('milestone')
      .where({ milestone_id: milestoneId, participant_id: userId })
      .del();

    res.redirect(`/admin/participants/${userId}?success=milestone_deleted`);
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.redirect(`/admin/participants/${userId}?error=milestone_delete_failed`);
  }
});

// ============================================
// ADMIN - EVENTS MANAGEMENT
// ============================================

// Admin events page - view/manage all events
app.get('/admin/events', requireAdmin, async (req, res) => {
  try {
    const { search = '', page = 1, start_date = '', end_date = '' } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    let query = knex('event_occurance')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .select('event_occurance.*', 'events.event_description as description', 'events.event_name as title');
    let countQuery = knex('event_occurance')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .count('event_occurance.event_occurance_id as count');

    // Apply search filter
    if (search) {
      const searchFilter = function() {
        this.where('events.event_name', 'ilike', `%${search}%`)
            .orWhere('events.event_description', 'ilike', `%${search}%`)
            .orWhere('event_occurance.event_location', 'ilike', `%${search}%`);
      };
      query = query.where(searchFilter);
      countQuery = countQuery.where(searchFilter);
    }

    // Apply date filters
    if (start_date) {
      query = query.where('event_occurance.event_date_time_start', '>=', start_date);
      countQuery = countQuery.where('event_occurance.event_date_time_start', '>=', start_date);
    }
    if (end_date) {
      const endDateTime = new Date(end_date);
      endDateTime.setHours(23, 59, 59, 999);
      query = query.where('event_occurance.event_date_time_start', '<=', endDateTime);
      countQuery = countQuery.where('event_occurance.event_date_time_start', '<=', endDateTime);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const events = await query.orderBy('event_occurance.event_date_time_start', 'asc').limit(limit).offset(offset);

    res.render('admin/events', {
      title: 'Events - Admin - Ella Rises',
      events,
      search,
      start_date,
      end_date,
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      req,
    });
  } catch (error) {
    console.error('Error loading events:', error);
    res.status(500).send('Error loading events');
  }
});

// Admin - Create new event form
app.get('/admin/events/new', requireAdmin, (req, res) => {
  res.render('admin/event-form', {
    title: 'Create New Event - Admin - Ella Rises',
    event: null,
    error: null,
    req,
  });
});

// Admin - Create new event
app.post('/admin/events/new', requireAdmin, upload.single('event_image'), async (req, res) => {
  const { title, description, date, start_time, end_time, location, capacity } = req.body; // title and description are from old form

  try {
    // Ensure the event name exists in the 'events' (template) table.
    const existingEventTemplate = await knex('events').where({ event_name: title }).first();
    if (!existingEventTemplate) {
      await knex('events').insert({ event_name: title, event_description: description });
    }

    const eventData = {
      event_occurance_id: Math.floor(Math.random() * 1000000), // Not a good long term solution
      event_name: title, // Map form's title to event_name
      event_date_time_start: new Date(start_time || date),
      event_date_time_end: end_time ? new Date(end_time) : null,
      event_location: location,
      event_capacity: capacity ? parseInt(capacity) : null,
      image_url: req.file ? `/images/events/${req.file.filename}` : null,
      created_at: new Date(),
    };

    await knex('event_occurance').insert(eventData);
    res.redirect('/admin/events?success=created');
  } catch (error) {
    console.error('Error creating event:', error);
    res.render('admin/event-form', {
      title: 'Create New Event - Admin - Ella Rises', // Still using title for rendering error
      event: null,
      error: 'Failed to create event. Please try again.',
    });
  }
});

// Admin - Edit event form
app.get('/admin/events/:id/edit', requireAdmin, async (req, res) => {
  try {
    const event = await knex('event_occurance')
      .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'event_occurance.event_occurance_id',
        'event_occurance.event_name',
        'event_occurance.event_date_time_start',
        'event_occurance.event_date_time_end',
        'event_occurance.event_location',
        'event_occurance.event_capacity',
        'event_occurance.event_registration_deadline',
        'event_occurance.image_url',
        'events.event_description as description',
        'events.event_name as title'
      )
      .where('event_occurance.event_occurance_id', req.params.id)
      .first();
    if (!event) {
      return res.status(404).send('Event not found');
    }

    res.render('admin/event-form', {
      title: 'Edit Event - Admin - Ella Rises',
      event,
      error: null,
      req,
    });
  } catch (error) {
    console.error('Error loading event:', error);
    res.status(500).send('Error loading event');
  }
});

// Admin - Update event
app.post('/admin/events/:id/edit', requireAdmin, upload.single('event_image'), async (req, res) => {
  const { title, description, date, start_time, end_time, location, capacity } = req.body;

  try {
    // Ensure the event name exists in the 'events' (template) table.
    const existingEventTemplate = await knex('events').where({ event_name: title }).first();
    if (!existingEventTemplate) {
      await knex('events').insert({ event_name: title, event_description: description });
    }
    
    const eventData = {
      event_name: title, // Map form's title to event_name
      event_date_time_start: new Date(start_time || date),
      event_date_time_end: end_time ? new Date(end_time) : null,
      event_location: location,
      event_capacity: capacity ? parseInt(capacity) : null,
    };

    // Only update image if new one uploaded
    if (req.file) {
      eventData.image_url = `/images/events/${req.file.filename}`;
    }

    await knex('event_occurance').where('event_occurance_id', req.params.id).update(eventData);
    res.redirect('/admin/events?success=updated');
  } catch (error) {
    console.error('Error updating event:', error);
    const event = await knex('event_occurance') // Use event_occurance table for rendering error
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .select('event_occurance.*', 'events.event_description as description', 'events.event_name as title')
      .where('event_occurance.event_occurance_id', req.params.id)
      .first();
    res.render('admin/event-form', {
      title: 'Edit Event - Admin - Ella Rises',
      event,
      error: 'Failed to update event. Please try again.',
    });
  }
});

// Admin - Delete event
app.post('/admin/events/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('event_occurance').where('event_occurance_id', req.params.id).delete();
    res.redirect('/admin/events?success=deleted');
  } catch (error) {
    console.error('Error deleting event:', error);
    res.redirect('/admin/events?error=delete_failed');
  }
});

// ============================================
// ADMIN - PROGRAMS MANAGEMENT
// ============================================

// Admin programs page - view/manage all programs
app.get('/admin/programs', requireAdmin, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    const [{ count }] = await knex('programs').count('* as count');
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const programs = await knex('programs').select('*').orderBy('title', 'asc').limit(limit).offset(offset);

    res.render('admin/programs', {
      title: 'Programs - Admin - Ella Rises',
      programs,
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      req,
    });
  } catch (error) {
    console.error('Error loading programs:', error);
    res.status(500).send('Error loading programs');
  }
});

// Admin - Program enrollments list
app.get('/admin/program-enrollments', requireAdmin, async (req, res) => {
  try {
    const enrollments = await knex('program_enrollments')
      .join('programs', 'program_enrollments.program_id', 'programs.id')
      .join('participants', 'program_enrollments.user_id', 'participants.id')
      .select(
        'program_enrollments.id',
        'participants.first_name',
        'participants.last_name',
        'participants.email',
        'programs.title as program_title',
        'program_enrollments.enrolled_at',
        'program_enrollments.status'
      )
      .orderBy('program_enrollments.enrolled_at', 'desc');

    res.render('admin/program-enrollments', {
      title: 'Program Enrollments - Admin - Ella Rises',
      enrollments,
      req,
    });
  } catch (error) {
    console.error('Error loading program enrollments:', error);
    res.status(500).send('Error loading program enrollments');
  }
});

// Admin - Create new program form
app.get('/admin/programs/new', requireAdmin, (req, res) => {
  res.render('admin/program-form', {
    title: 'Create New Program - Admin - Ella Rises',
    program: null,
    error: null,
  });
});

// Admin - Create new program
app.post('/admin/programs/new', requireAdmin, upload.single('program_image'), async (req, res) => {
  const { title, description, age_range, schedule, fee, additional_info } = req.body;

  try {
    const programData = {
      title,
      description,
      age_range,
      schedule,
      fee: fee ? parseFloat(fee) : null,
      additional_info,
      image_url: req.file ? `/images/events/${req.file.filename}` : null,
    };

    await knex('programs').insert(programData);
    res.redirect('/admin/programs?success=created');
  } catch (error) {
    console.error('Error creating program:', error);
    res.render('admin/program-form', {
      title: 'Create New Program - Admin - Ella Rises',
      program: null,
      error: 'Failed to create program. Please try again.',
    });
  }
});

// Admin - Edit program form
app.get('/admin/programs/:id/edit', requireAdmin, async (req, res) => {
  try {
    const program = await knex('programs').where('id', req.params.id).first();
    if (!program) {
      return res.status(404).send('Program not found');
    }

    res.render('admin/program-form', {
      title: 'Edit Program - Admin - Ella Rises',
      program,
      error: null,
      req,
    });
  } catch (error) {
    console.error('Error loading program:', error);
    res.status(500).send('Error loading program');
  }
});

// Admin - Update program
app.post('/admin/programs/:id/edit', requireAdmin, upload.single('program_image'), async (req, res) => {
  const { title, description, age_range, schedule, fee, additional_info } = req.body;

  try {
    const programData = {
      title,
      description,
      age_range,
      schedule,
      fee: fee ? parseFloat(fee) : null,
      additional_info,
    };

    // Only update image if new one uploaded
    if (req.file) {
      programData.image_url = `/images/events/${req.file.filename}`;
    }

    await knex('programs').where('id', req.params.id).update(programData);
    res.redirect('/admin/programs?success=updated');
  } catch (error) {
    console.error('Error updating program:', error);
    const program = await knex('programs').where('id', req.params.id).first();
    res.render('admin/program-form', {
      title: 'Edit Program - Admin - Ella Rises',
      program,
      error: 'Failed to update program. Please try again.',
    });
  }
});

// Admin - Delete program
app.post('/admin/programs/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('programs').where('id', req.params.id).delete();
    res.redirect('/admin/programs?success=deleted');
  } catch (error) {
    console.error('Error deleting program:', error);
    res.redirect('/admin/programs?error=delete_failed');
  }
});

// ============================================
// ADMIN - SURVEYS MANAGEMENT
// ============================================

// Admin surveys page - view all surveys
app.get('/admin/surveys', requireAdmin, async (req, res) => {
  try {
    const { search_event, search_participant, sort_by, sort_order, filter_nps, page = 1 } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    let query = knex('registration')
      .join('participants', 'registration.participant_id', 'participants.id')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name') // Join with event templates to get proper event name/title
      .select(
        'registration.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'participants.participant_email as user_email',
        'events.event_name as event_title' // Use event_name from template as title
      )
      .whereNotNull('registration.survey_submission_date');

    let countQuery = knex('registration')
      .join('participants', 'registration.participant_id', 'participants.id')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name') // Join with event templates
      .count('registration.registration_id as count')
      .whereNotNull('registration.survey_submission_date');

    // Apply event search filter
    if (search_event) {
      const filter = builder => builder.where('events.event_name', 'ilike', `%${search_event}%`);
      query = query.where(filter);
      countQuery = countQuery.where(filter);
    }

    // Apply participant search filter
    if (search_participant) {
      const filter = builder => builder.where(knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name)"), 'ilike', `%${search_participant}%`);
      query = query.where(filter);
      countQuery = countQuery.where(filter);
    }

    // Apply NPS filter
    if (filter_nps) {
      if (filter_nps === 'Promoter') {
        query = query.where('registration.survey_recommendation_score', '=', 5);
        countQuery = countQuery.where('registration.survey_recommendation_score', '=', 5);
      } else if (filter_nps === 'Passive') {
        query = query.where('registration.survey_recommendation_score', '=', 4);
        countQuery = countQuery.where('registration.survey_recommendation_score', '=', 4);
      } else if (filter_nps === 'Detractor') {
        query = query.where('registration.survey_recommendation_score', '<=', 3);
        countQuery = countQuery.where('registration.survey_recommendation_score', '<=', 3);
      }
    }

    // Apply sorting
    const sortField = sort_by || 'registration_created_at'; // Default to new created_at
    const order = sort_order || 'desc';

    if (sortField === 'survey_overall_score') { // New column name
      query = query.orderBy('registration.survey_overall_score', order);
    } else if (sortField === 'date') {
      query = query.orderBy('registration.registration_created_at', order); // New column name
    } else {
      query = query.orderBy('registration.registration_created_at', order); // New column name
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const surveys = await query.limit(limit).offset(offset);

    // Get all events and users for dropdowns
    const eventsDropdown = await knex('events') // event templates
      .distinct('event_name')
      .orderBy('event_name', 'asc');

    const usersDropdown = await knex('participants')
      .where('participant_role', 'participant') // Filter by new role name
      .select('id', knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name"))
      .orderBy('name', 'asc');

    // Add net_promoter_score to each survey
    surveys.forEach(survey => {
      if (survey.survey_recommendation_score <= 3) { // New column name
        survey.survey_nps_bucket = 'Detractor';
      } else if (survey.survey_recommendation_score === 4) { // New column name
        survey.survey_nps_bucket = 'Passive';
      } else {
        survey.survey_nps_bucket = 'Promoter';
      }
    });

    res.render('admin/surveys', {
      title: 'Surveys - Admin - Ella Rises',
      surveys,
      events: eventsDropdown,
      users: usersDropdown,
      search_event: search_event || '',
      search_participant: search_participant || '',
      sort_by: sortField,
      sort_order: order,
      filter_nps: filter_nps || '',
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      req,
    });
  } catch (error) {
    console.error('Error loading surveys:', error);
    res.status(500).send('Error loading surveys');
  }
});

// Admin - Create new survey form (MUST come before /:surveyId routes)
app.get('/admin/surveys/new/survey', requireAdmin, async (req, res) => {
  try {
    const users = await knex('participants').select('id', knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name")).orderBy('name');
    const events = await knex('events').select('event_name as id', 'event_name as title').orderBy('title'); // Use event_name as id and title for consistency

    res.render('admin/survey-form', {
      title: 'Create New Survey - Admin - Ella Rises',
      survey: null,
      users,
      events,
      error: null,
    });
  } catch (error) {
    console.error('Error loading survey form:', error);
    res.status(500).send('Error loading form');
  }
});

// Admin - Create new survey
app.post('/admin/surveys/new/survey', requireAdmin, async (req, res) => {
  const { user_id, event_id, satisfaction_rating, usefulness_rating, instructor_rating, recommendation_rating, additional_feedback } = req.body;

  try {
    // Calculate overall score as average of all 4 ratings
    const sat = parseInt(satisfaction_rating);
    const use = parseInt(usefulness_rating);
    const inst = parseInt(instructor_rating);
    const rec = parseInt(recommendation_rating);
    const survey_overall_score = ((sat + use + inst + rec) / 4).toFixed(2);

    // Calculate Net Promoter Score bucket
    let survey_nps_bucket;
    if (rec <= 3) {
      survey_nps_bucket = 'Detractor';
    } else if (rec === 4) {
      survey_nps_bucket = 'Passive';
    } else {
      survey_nps_bucket = 'Promoter';
    }

    // event_id here is actually event_name from the dropdown
    const eventOccurance = await knex('event_occurance').where({ event_name: event_id }).first();
    if (!eventOccurance) {
        throw new Error('Event not found for survey submission.');
    }

    await knex('registration').insert({
      participant_id: user_id,
      event_occurance_id: eventOccurance.event_occurance_id, // Use the ID from event_occurance
      survey_satisfaction_score: sat,
      survey_usefulness_score: use,
      survey_instructor_score: inst,
      survey_recommendation_score: rec,
      survey_overall_score: survey_overall_score,
      survey_nps_bucket: survey_nps_bucket,
      survey_comments: additional_feedback,
      registration_created_at: new Date(),
      survey_submission_date: new Date(),
    });

    res.redirect('/admin/surveys?success=created');
  } catch (error) {
    console.error('Error creating survey:', error);
    const users = await knex('participants').select('id', knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name")).orderBy('name');
    const events = await knex('events').select('event_name as id', 'event_name as title').orderBy('title');
    res.render('admin/survey-form', {
      title: 'Create New Survey - Admin - Ella Rises',
      survey: null,
      users,
      events,
      error: 'Error creating survey. Please try again.',
    });
  }
});

// Admin view individual survey detail
app.get('/admin/surveys/:surveyId', requireAdmin, async (req, res) => {
  const { surveyId } = req.params;

  try {
    const survey = await knex('registration')
      .join('participants', 'registration.participant_id', 'participants.id')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name') // Join with event templates for title
      .select(
        'registration.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'participants.participant_email as user_email',
        'events.event_name as event_title' // Use event_name from template as title
      )
      .where('registration.registration_id', surveyId)
      .first();

    if (!survey) {
      return res.status(404).send('Survey not found');
    }

    // Calculate net_promoter_score
    if (survey.survey_recommendation_score <= 3) { // New column name
      survey.survey_nps_bucket = 'Detractor';
    } else if (survey.survey_recommendation_score === 4) { // New column name
      survey.survey_nps_bucket = 'Passive';
    } else {
      survey.survey_nps_bucket = 'Promoter';
    }

    res.render('admin/survey-detail', {
      title: 'Survey Detail - Admin - Ella Rises',
      survey,
      req,
    });
  } catch (error) {
    console.error('Error loading survey:', error);
    res.status(500).send('Error loading survey');
  }
});

// Admin - Edit survey form
// Fetches a single survey response and renders the edit form.
app.get('/admin/surveys/:id/edit', requireAdmin, async (req, res) => {
  try {
    // We join with participants and events tables to get the names for display purposes.
    const survey = await knex('registration')
      .leftJoin('participants', 'registration.participant_id', 'participants.id')
      .leftJoin('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'registration.*',
        knex.raw("COALESCE(CONCAT(participants.participant_first_name, ' ', COALESCE(participants.participant_last_name, '')), 'Unknown Participant') as participant_name"),
        knex.raw("COALESCE(events.event_name, 'Unknown Event') as event_name")
      )
      .where('registration.registration_id', req.params.id)
      .first();

    if (!survey) {
      return res.status(404).send('Survey not found');
    }

    // The form does not allow changing the participant or event, so we don't need to pass the full lists.
    res.render('admin/survey-form', {
      title: 'Edit Survey - Admin - Ella Rises',
      survey,
      error: null,
      req,
    });
  } catch (error) {
    console.error('Error loading survey for edit:', error);
    res.status(500).send('Error loading survey');
  }
});

// Admin - Update survey
// Handles the submission of the survey edit form.
app.post('/admin/surveys/:id/edit', requireAdmin, async (req, res) => {
  // We only want to update the survey-related fields. Participant and event are not editable.
  const { satisfaction_rating, usefulness_rating, instructor_rating, recommendation_rating, additional_feedback } = req.body;

  try {
    const sat = parseInt(satisfaction_rating);
    const use = parseInt(usefulness_rating);
    const inst = parseInt(instructor_rating);
    const rec = parseInt(recommendation_rating);

    // Basic validation to ensure all ratings are provided and are numbers.
    if (isNaN(sat) || isNaN(use) || isNaN(inst) || isNaN(rec)) {
      throw new Error('All rating fields are required and must be numbers.');
    }

    // Recalculate scores based on the new ratings.
    const survey_overall_score = ((sat + use + inst + rec) / 4).toFixed(2);

    let survey_nps_bucket;
    if (rec <= 3) {
      survey_nps_bucket = 'Detractor';
    } else if (rec === 4) {
      survey_nps_bucket = 'Passive';
    } else {
      survey_nps_bucket = 'Promoter';
    }

    // Update the registration record with the new survey data.
    await knex('registration')
      .where('registration_id', req.params.id)
      .update({
        survey_satisfaction_score: sat,
        survey_usefulness_score: use,
        survey_instructor_score: inst,
        survey_recommendation_score: rec,
        survey_overall_score: survey_overall_score,
        survey_nps_bucket: survey_nps_bucket,
        survey_comments: additional_feedback,
        survey_submission_date: new Date(), // Update submission date to now.
      });

    res.redirect(`/admin/surveys/${req.params.id}?success=updated`);
  } catch (error) {
    console.error('Error updating survey:', error);
    // If an error occurs, re-render the form with an error message.
    // We need to re-fetch the survey data to populate the form correctly.
    const survey = await knex('registration')
      .leftJoin('participants', 'registration.participant_id', 'participants.id')
      .leftJoin('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'registration.*',
        knex.raw("COALESCE(CONCAT(participants.participant_first_name, ' ', COALESCE(participants.participant_last_name, '')), 'Unknown Participant') as participant_name"),
        knex.raw("COALESCE(events.event_name, 'Unknown Event') as event_name")
      )
      .where('registration.registration_id', req.params.id)
      .first();

    res.render('admin/survey-form', {
      title: 'Edit Survey - Admin - Ella Rises',
      survey,
      error: 'Error updating survey. Please try again.',
      req,
    });
  }
});

// Admin - Delete survey
app.post('/admin/surveys/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('registration').where('registration_id', req.params.id).del();
    res.redirect('/admin/surveys?success=deleted');
  } catch (error) {
    console.error('Error deleting survey:', error);
    res.redirect('/admin/surveys?error=delete_failed');
  }
});

// ============================================
// ADMIN - MILESTONES MANAGEMENT
// ============================================

// Admin milestones page - view all milestones
app.get('/admin/milestones', requireAdmin, async (req, res) => {
  try {
    const { search, filter_milestone, page = 1 } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    // Get all distinct milestone categories for the filter dropdown
    const milestoneCategories = await knex('milestone')
      .distinct('milestone_category')
      .orderBy('milestone_category', 'asc');

    // Build query for participants
    let participantsQuery = knex('participants')
      .whereIn('participant_role', ['participant', 'admin'])
      .orderBy('participant_first_name', 'asc');

    let countQuery = knex('participants')
      .whereIn('participant_role', ['participant', 'admin'])
      .count('* as count');

    if (search) {
      const searchFilter = function () {
        this.where(knex.raw("CONCAT(participant_first_name, ' ', participant_last_name)"), 'ilike', `%${search}%`)
            .orWhere('participant_email', 'ilike', `%${search}%`);
      };
      participantsQuery = participantsQuery.where(searchFilter);
      countQuery = countQuery.where(searchFilter);
    }

    // Get all participant milestones for the timeline and for filtering
    const participantMilestones = await knex('milestone')
      .join('participants', 'milestone.participant_id', 'participants.id')
      .select(
        'milestone.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name")
      );

    let users = await participantsQuery;
    
    // Filter users by milestone category if specified
    if (filter_milestone) {
        users = users.filter(user => {
            return participantMilestones.some(pm => pm.participant_id === user.id && pm.milestone_category === filter_milestone);
        });
    }

    // Build a map of user achievements for the "By Category" view
    const userAchievements = {};
    participantMilestones.forEach(pm => {
      if (!userAchievements[pm.participant_id]) {
        userAchievements[pm.participant_id] = {};
      }
      if (!userAchievements[pm.participant_id][pm.milestone_category]) {
        userAchievements[pm.participant_id][pm.milestone_category] = [];
      }
      userAchievements[pm.participant_id][pm.milestone_category].push(pm);
    });

    const totalRecords = users.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const paginatedUsers = users.slice(offset, offset + limit);

    res.render('admin/milestones', {
      title: 'Milestones - Admin',
      paginatedUsers, // For "By Category" view
      milestoneCategories,
      userAchievements,
      participantMilestones, // For "Timeline" view
      search,
      filter_milestone,
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      req,
    });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).send('Error loading milestones');
  }
});

// Admin view user milestone details
app.get('/admin/milestones/user/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await knex('participants')
      .where('id', userId)
      .first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    // NEW SCHEMA: milestone table is merged - no JOIN needed
    const userMilestones = await knex('milestone')
      .where('participant_id', userId)
      .select('*')
      .orderBy('milestone_date', 'desc');

    res.render('admin/user-milestones', {
      title: `${user.participant_first_name} ${user.participant_last_name}'s Milestones - Admin - Ella Rises`,
      user,
      milestones: userMilestones,
    });
  } catch (error) {
    console.error('Error loading user milestones:', error);
    res.status(500).send('Error loading user milestones');
  }
});

// Admin - Create milestone (NEW SCHEMA: requires participant_id)
app.post('/admin/milestones/create', requireAdmin, async (req, res) => {
  const { participant_id, milestone_title, milestone_category } = req.body;

  try {
    await knex('milestone').insert({
      participant_id,
      milestone_title,
      milestone_category,
      milestone_date: new Date(),
    });

    res.redirect('/admin/milestones?success=created');
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.redirect('/admin/milestones?error=create_failed');
  }
});

// Admin - Edit milestone form
app.get('/admin/milestones/:id/edit', requireAdmin, async (req, res) => {
  try {
    const milestone = await knex('milestone')
      .where('milestone_id', req.params.id)
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found');
    }

    // Get all distinct milestone categories for the dropdown
    const milestoneCategories = await knex('milestone')
      .distinct('milestone_category')
      .whereNotNull('milestone_category')
      .orderBy('milestone_category', 'asc');

    res.render('admin/milestone-edit-form', {
      title: 'Edit Milestone - Admin - Ella Rises',
      milestone,
      categories: milestoneCategories,
      error: null,
    });
  } catch (error) {
    console.error('Error loading milestone for edit:', error);
    res.status(500).send('Error loading milestone');
  }
});

// Admin - Update milestone
app.post('/admin/milestones/:id/edit', requireAdmin, async (req, res) => {
  const { milestone_title, milestone_category, milestone_date } = req.body;

  try {
    const milestone = await knex('milestone')
      .where('milestone_id', req.params.id)
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found');
    }

    await knex('milestone')
      .where('milestone_id', req.params.id)
      .update({
        milestone_title,
        milestone_category,
        milestone_date: milestone_date ? new Date(milestone_date) : milestone.milestone_date,
      });

    res.redirect(`/admin/milestones/user/${milestone.participant_id}?success=updated`);
  } catch (error) {
    console.error('Error updating milestone:', error);
    const milestone = await knex('milestone')
      .where('milestone_id', req.params.id)
      .first();

    res.redirect(`/admin/milestones/user/${milestone.participant_id}?error=update_failed`);
  }
});

// Admin - Delete milestone
app.post('/admin/milestones/:id/delete', requireAdmin, async (req, res) => {
  try {
    const milestone = await knex('milestone')
      .where('milestone_id', req.params.id)
      .first();

    if (!milestone) {
      return res.status(404).send('Milestone not found');
    }

    const participantId = milestone.participant_id;

    await knex('milestone').where('milestone_id', req.params.id).del();
    res.redirect(`/admin/milestones/user/${participantId}?success=deleted`);
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.redirect('/admin/milestones?error=delete_failed');
  }
});

// ============================================
// ADMIN - DONATIONS MANAGEMENT
// ============================================

// Admin donations page - view all donations
app.get('/admin/donations', requireAdmin, async (req, res) => {
  try {
    const { search = '', page = 1, start_date = '', end_date = '' } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    let query = knex('donations')
      .leftJoin('participants', 'donations.participant_id', 'participants.id')
      .select(
        'donations.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name")
      );

    let countQuery = knex('donations')
      .leftJoin('participants', 'donations.participant_id', 'participants.id')
      .count('donations.donation_id as count');

    let totalQuery = knex('donations')
      .leftJoin('participants', 'donations.participant_id', 'participants.id')
      .sum('donations.donation_amount as total');

    // Apply search filter
    if (search) {
      if (!isNaN(parseFloat(search)) && isFinite(search)) {
        // Search by amount if the search term is numeric
        query = query.where('donations.donation_amount', '=', parseFloat(search));
        countQuery = countQuery.where('donations.donation_amount', '=', parseFloat(search));
        totalQuery = totalQuery.where('donations.donation_amount', '=', parseFloat(search));
      } else {
        // Otherwise, search by name
        const searchFilter = function () {
          this.where(knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name)"), 'ILIKE', `%${search}%`);
        };
        query = query.where(searchFilter);
        countQuery = countQuery.where(searchFilter);
        totalQuery = totalQuery.where(searchFilter);
      }
    }

    // Apply date filters (use donation_date if present, fallback to created_at)
    if (start_date) {
      query = query.whereRaw('COALESCE(donations.donation_date, donations.created_at) >= ?', [start_date]);
      countQuery = countQuery.whereRaw('COALESCE(donations.donation_date, donations.created_at) >= ?', [start_date]);
      totalQuery = totalQuery.whereRaw('COALESCE(donations.donation_date, donations.created_at) >= ?', [start_date]);
    }
    if (end_date) {
      const endDateTime = new Date(end_date);
      endDateTime.setHours(23, 59, 59, 999);
      query = query.whereRaw('COALESCE(donations.donation_date, donations.created_at) <= ?', [endDateTime]);
      countQuery = countQuery.whereRaw('COALESCE(donations.donation_date, donations.created_at) <= ?', [endDateTime]);
      totalQuery = totalQuery.whereRaw('COALESCE(donations.donation_date, donations.created_at) <= ?', [endDateTime]);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const donations = await query
      .orderByRaw('COALESCE(donations.donation_date, donations.created_at) DESC, donations.donation_id DESC')
      .limit(limit)
      .offset(offset);

    // Calculate total from ALL filtered results
    const [{ total }] = await totalQuery;
    const totalAmount = parseFloat(total || 0);

    res.render('admin/donations', {
      title: 'Donations - Admin - Ella Rises',
      donations,
      search,
      start_date,
      end_date,
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      totalAmount,
      req,
    });
  } catch (error) {
    console.error('Error loading donations:', error);
    res.status(500).send('Error loading donations');
  }
});

// Admin - Create donation manually
app.post('/admin/donations/create', requireAdmin, async (req, res) => {
  const { amount, donor_email, donation_date } = req.body;

  try {
    let participantId = null;

    // If a donor email is provided, try to find a matching participant
    if (donor_email && donor_email.trim() !== '') {
      const participant = await knex('participants')
        .where({ participant_email: donor_email.trim() })
        .first();
      if (participant) {
        participantId = participant.id;
      }
    }

    // Insert donation (participant_id will be null for anonymous donations)
    await knex('donations').insert({
      participant_id: participantId,
      donation_amount: parseFloat(amount),
      donation_date: donation_date ? new Date(donation_date) : new Date(),
      created_at: new Date(),
    });

    res.redirect('/admin/donations?success=created');
  } catch (error) {
    console.error('Error creating donation:', error);
    res.redirect('/admin/donations?error=create_failed');
  }
});

// Admin - Update donation
app.post('/admin/donations/:id/edit', requireAdmin, async (req, res) => {
  const { participant_id, amount, donation_date } = req.body;

  try {
    await knex('donations')
      .where('donation_id', req.params.id)
      .update({
        participant_id: participant_id || null,
        donation_amount: parseFloat(amount),
        donation_date: donation_date ? new Date(donation_date) : knex.raw('donation_date'),
      });

    res.redirect('/admin/donations?success=updated');
  } catch (error) {
    console.error('Error updating donation:', error);
    res.redirect('/admin/donations?error=update_failed');
  }
});

// Admin - Delete donation
app.post('/admin/donations/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('donations').where('donation_id', req.params.id).del();
    res.redirect('/admin/donations?success=deleted');
  } catch (error) {
    console.error('Error deleting donation:', error);
    res.redirect('/admin/donations?error=delete_failed');
  }
});

// ============================================
// ADMIN - ANALYTICS PLACEHOLDER
// ============================================

// Admin analytics page - placeholder for future Tableau dashboard
app.get('/admin/analytics', requireAdmin, (req, res) => {
  res.render('admin/analytics', {
    title: 'Analytics - Admin - Ella Rises',
  });
});

// ============================================
// ============================================
// CSV/PDF EXPORT ROUTES
// ============================================

// Export Participants as CSV
app.get('/admin/participants/export/csv', requireAdmin, async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = knex('participants').select(
      'id',
      knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name"),
      'participant_email as email',
      'participant_role as role',
      'total_donations',
      'login_count',
      'created_at'
    );

    if (search) {
      query = query.where(function() {
        this.where('participant_first_name', 'ilike', `%${search}%`)
          .orWhere('participant_last_name', 'ilike', `%${search}%`)
          .orWhere('participant_email', 'ilike', `%${search}%`);
      });
    }

    const users = await query.orderBy('created_at', 'desc');

    // Format data for CSV
    const csvData = users.map(user => ({
      ID: user.id,
      Name: user.name,
      Email: user.email,
      Role: user.role,
      'Total Donations': user.total_donations ? `$${parseFloat(user.total_donations).toFixed(2)}` : '$0.00',
      'Login Count': user.login_count || 0,
      'Created At': new Date(user.created_at).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=participants.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting participants CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Participants as PDF
app.get('/admin/participants/export/pdf', requireAdmin, async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = knex('participants').select(
      'id',
      knex.raw("CONCAT(participant_first_name, ' ', participant_last_name) as name"),
      'participant_email as email',
      'participant_role as role',
      'total_donations',
      'login_count'
    );

    if (search) {
      query = query.where(function() {
        this.where('participant_first_name', 'ilike', `%${search}%`)
          .orWhere('participant_last_name', 'ilike', `%${search}%`)
          .orWhere('participant_email', 'ilike', `%${search}%`);
      });
    }

    const users = await query.orderBy('created_at', 'desc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=participants.pdf');
    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Ella Rises - Participants Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // Table headers
    doc.fontSize(10);
    const tableTop = 150;
    const col1 = 50;
    const col2 = 150;
    const col3 = 280;
    const col4 = 400;
    const col5 = 480;

    doc.font('Helvetica-Bold');
    doc.text('Name', col1, tableTop);
    doc.text('Email', col2, tableTop);
    doc.text('Role', col3, tableTop);
    doc.text('Donations', col4, tableTop);
    doc.text('Logins', col5, tableTop);

    doc.font('Helvetica');
    let y = tableTop + 20;

    users.forEach((user, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(user.name.substring(0, 15), col1, y);
      doc.text(user.email.substring(0, 20), col2, y);
      doc.text(user.role, col3, y);
      doc.text(user.total_donations ? `$${parseFloat(user.total_donations).toFixed(2)}` : '$0.00', col4, y);
      doc.text((user.login_count || 0).toString(), col5, y);

      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting participants PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Export Events as CSV (NEW SCHEMA: exports event occurrences)
app.get('/admin/events/export/csv', requireAdmin, async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = knex('event_occurance')
      .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'event_occurance.event_occurance_id',
        'events.event_name',
        'events.event_type',
        'events.event_description',
        'event_occurance.event_date_time_start',
        'event_occurance.event_date_time_end',
        'event_occurance.event_location',
        'event_occurance.event_capacity',
        'event_occurance.created_at'
      );

    if (search) {
      query = query.where(function() {
        this.where('events.event_name', 'ilike', `%${search}%`)
          .orWhere('events.event_description', 'ilike', `%${search}%`)
          .orWhere('event_occurance.event_location', 'ilike', `%${search}%`);
      });
    }

    const events = await query.orderBy('event_occurance.event_date_time_start', 'desc');

    const csvData = events.map(event => ({
      ID: event.event_occurance_id,
      'Event Name': event.event_name,
      Type: event.event_type,
      Description: event.event_description || '',
      Location: event.event_location || '',
      'Start Time': event.event_date_time_start ? new Date(event.event_date_time_start).toLocaleString() : '',
      'End Time': event.event_date_time_end ? new Date(event.event_date_time_end).toLocaleString() : '',
      Capacity: event.event_capacity || 0,
      'Created At': new Date(event.created_at).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=events.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting events CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Events as PDF (NEW SCHEMA: exports event occurrences)
app.get('/admin/events/export/pdf', requireAdmin, async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = knex('event_occurance')
      .leftJoin('events', 'event_occurance.event_name', 'events.event_name')
      .select(
        'event_occurance.event_occurance_id',
        'events.event_name',
        'events.event_type',
        'events.event_description',
        'event_occurance.event_date_time_start',
        'event_occurance.event_date_time_end',
        'event_occurance.event_location',
        'event_occurance.event_capacity'
      );

    if (search) {
      query = query.where(function() {
        this.where('events.event_name', 'ilike', `%${search}%`)
          .orWhere('events.event_description', 'ilike', `%${search}%`)
          .orWhere('event_occurance.event_location', 'ilike', `%${search}%`);
      });
    }

    const events = await query.orderBy('event_occurance.event_date_time_start', 'desc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=events.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Ella Rises - Events Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(10);
    let y = 150;

    events.forEach((event, i) => {
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      doc.font('Helvetica-Bold').text(event.event_name || 'Untitled Event', 50, y);
      y += 15;
      doc.font('Helvetica').fontSize(9);
      doc.text(`Type: ${event.event_type || 'N/A'}`, 50, y);
      y += 12;
      doc.text(`Location: ${event.event_location || 'TBD'}`, 50, y);
      y += 12;
      doc.text(`Start: ${event.event_date_time_start ? new Date(event.event_date_time_start).toLocaleString() : 'TBD'}`, 50, y);
      y += 12;
      doc.text(`Capacity: ${event.event_capacity || 'Unlimited'}`, 50, y);
      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting events PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Export Donations as CSV (NEW SCHEMA)
app.get('/admin/donations/export/csv', requireAdmin, async (req, res) => {
  try {
    const donations = await knex('donations')
      .leftJoin('participants', 'donations.participant_id', 'participants.id')
      .select(
        'donations.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'participants.participant_email as user_email'
      )
      .orderBy('donations.created_at', 'desc');

    const csvData = donations.map(donation => ({
      ID: donation.donation_id,
      'Donor Name': donation.user_name || 'Anonymous',
      'Donor Email': donation.user_email || 'N/A',
      Amount: `$${parseFloat(donation.donation_amount).toFixed(2)}`,
      'Donation Date': donation.donation_date ? new Date(donation.donation_date).toLocaleDateString() : 'N/A',
      'Created At': new Date(donation.created_at).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=donations.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting donations CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Donations as PDF (NEW SCHEMA)
app.get('/admin/donations/export/pdf', requireAdmin, async (req, res) => {
  try {
    const donations = await knex('donations')
      .leftJoin('participants', 'donations.participant_id', 'participants.id')
      .select(
        'donations.*',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'participants.participant_email as user_email'
      )
      .orderBy('donations.created_at', 'desc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=donations.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Ella Rises - Donations Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    const tableTop = 150;
    doc.fontSize(10);
    doc.font('Helvetica-Bold');
    doc.text('Donor', 50, tableTop);
    doc.text('Email', 180, tableTop);
    doc.text('Amount', 330, tableTop);
    doc.text('Date', 420, tableTop);

    doc.font('Helvetica');
    let y = tableTop + 20;

    donations.forEach((donation, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text((donation.user_name || 'Anonymous').substring(0, 20), 50, y);
      doc.text((donation.user_email || 'N/A').substring(0, 20), 180, y);
      doc.text(`$${parseFloat(donation.donation_amount).toFixed(2)}`, 330, y);
      doc.text(donation.donation_date ? new Date(donation.donation_date).toLocaleDateString() : 'N/A', 420, y);

      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting donations PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Export Surveys as CSV
app.get('/admin/surveys/export/csv', requireAdmin, async (req, res) => {
  try {
    const surveys = await knex('registration')
      .join('participants', 'registration.participant_id', 'participants.id')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .whereNotNull('registration.survey_submission_date')
      .select(
        'registration.registration_id',
        'registration.survey_satisfaction_score',
        'registration.survey_usefulness_score',
        'registration.survey_instructor_score',
        'registration.survey_recommendation_score',
        'registration.survey_overall_score',
        'registration.survey_nps_bucket',
        'registration.survey_comments',
        'registration.survey_submission_date',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'events.event_name as event_title',
        'event_occurance.event_date_time_start'
      )
      .orderBy('registration.survey_submission_date', 'desc');

    const csvData = surveys.map(survey => ({
      ID: survey.registration_id,
      'Participant': survey.user_name,
      'Event': survey.event_title,
      'Event Date': new Date(survey.event_date_time_start).toLocaleDateString(),
      'Satisfaction Score': survey.survey_satisfaction_score,
      'Usefulness Score': survey.survey_usefulness_score,
      'Instructor Score': survey.survey_instructor_score,
      'Recommendation Score': survey.survey_recommendation_score,
      'Overall Score': survey.survey_overall_score,
      'NPS Bucket': survey.survey_nps_bucket || '',
      'Comments': survey.survey_comments || '',
      'Submitted At': new Date(survey.survey_submission_date).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=surveys.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting surveys CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Surveys as PDF
app.get('/admin/surveys/export/pdf', requireAdmin, async (req, res) => {
  try {
    const surveys = await knex('registration')
      .join('participants', 'registration.participant_id', 'participants.id')
      .join('event_occurance', 'registration.event_occurance_id', 'event_occurance.event_occurance_id')
      .join('events', 'event_occurance.event_name', 'events.event_name')
      .whereNotNull('registration.survey_submission_date')
      .select(
        'registration.registration_id',
        'registration.survey_satisfaction_score',
        'registration.survey_usefulness_score',
        'registration.survey_instructor_score',
        'registration.survey_recommendation_score',
        'registration.survey_overall_score',
        'registration.survey_nps_bucket',
        'registration.survey_comments',
        'registration.survey_submission_date',
        knex.raw("CONCAT(participants.participant_first_name, ' ', participants.participant_last_name) as user_name"),
        'events.event_name as event_title',
        'event_occurance.event_date_time_start'
      )
      .orderBy('registration.survey_submission_date', 'desc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=surveys.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Ella Rises - Surveys Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();
    doc.text(`Total Surveys: ${surveys.length}`, { align: 'center' });
    doc.moveDown(2);

    let y = 180;

    surveys.forEach((survey, i) => {
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      doc.fontSize(10).font('Helvetica-Bold').text(`${survey.user_name} - ${survey.event_title}`, 50, y);
      y += 15;
      doc.font('Helvetica').fontSize(9);
      doc.text(`Event Date: ${new Date(survey.event_date_time_start).toLocaleDateString()}`, 50, y);
      y += 12;
      doc.text(`Satisfaction: ${survey.survey_satisfaction_score}/5 | Usefulness: ${survey.survey_usefulness_score}/5 | Instructor: ${survey.survey_instructor_score}/5 | Recommendation: ${survey.survey_recommendation_score}/5`, 50, y);
      y += 12;
      doc.text(`Overall Score: ${survey.survey_overall_score} | NPS: ${survey.survey_nps_bucket || 'N/A'}`, 50, y);
      y += 12;
      if (survey.survey_comments) {
        doc.text(`Comments: ${survey.survey_comments.substring(0, 200)}${survey.survey_comments.length > 200 ? '...' : ''}`, 50, y, { width: 500 });
        y += Math.ceil(survey.survey_comments.substring(0, 200).length / 80) * 12;
      }
      y += 15;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting surveys PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Export Programs as CSV
app.get('/admin/programs/export/csv', requireAdmin, async (req, res) => {
  try {
    const programs = await knex('programs')
      .select('*')
      .orderBy('created_at', 'desc');

    const csvData = programs.map(program => ({
      ID: program.id,
      Name: program.name,
      Description: program.description,
      'Start Date': program.start_date ? new Date(program.start_date).toLocaleDateString() : 'N/A',
      'End Date': program.end_date ? new Date(program.end_date).toLocaleDateString() : 'N/A',
      'Created At': new Date(program.created_at).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=programs.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting programs CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Programs as PDF
// This route generates a PDF report of all programs in the database.
app.get('/admin/programs/export/pdf', requireAdmin, async (req, res) => {
  try {
    const programs = await knex('programs')
      .select('*')
      .orderBy('created_at', 'desc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=programs.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Ella Rises - Programs Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    let y = 150;

    programs.forEach((program, i) => {
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      doc.fontSize(11).font('Helvetica-Bold').text(program.title, 50, y);
      y += 15;
      doc.font('Helvetica').fontSize(9);
      if (program.description) {
        doc.text(program.description.substring(0, 150), 50, y, { width: 500 });
        y += 25;
      }
      doc.text(`Schedule: ${program.schedule || 'N/A'}`, 50, y);
      y += 25;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting programs PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Export Milestones as CSV
app.get('/admin/milestones/export/csv', requireAdmin, async (req, res) => {
  try {
    const milestones = await knex('milestones')
      .select('*')
      .orderBy('title', 'asc');

    const csvData = milestones.map(milestone => ({
      ID: milestone.id,
      Title: milestone.title,
      Description: milestone.description,
      Category: milestone.category,
      'Created At': new Date(milestone.created_at).toLocaleDateString()
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=milestones.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting milestones CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

// Export Milestones as PDF
app.get('/admin/milestones/export/pdf', requireAdmin, async (req, res) => {
  try {
    const milestones = await knex('milestones')
      .select('*')
      .orderBy('title', 'asc');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=milestones.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Ella Rises - Milestones Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    const tableTop = 150;
    doc.fontSize(10);
    doc.font('Helvetica-Bold');
    doc.text('Title', 50, tableTop);
    doc.text('Category', 250, tableTop);
    doc.text('Description', 350, tableTop);

    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 20;

    milestones.forEach((milestone, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(milestone.title.substring(0, 30), 50, y);
      doc.text(milestone.category, 250, y);
      doc.text(milestone.description.substring(0, 30), 350, y);

      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting milestones PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// ERROR HANDLING
// ============================================

// 418 I'm a teapot - Easter egg route (required for IS 404 rubric)
app.get('/teapot', (req, res) => {
  res.status(418).render('teapot', {
    title: "I'm a Teapot - Ella Rises",
  });
});

// 404 handler - must be after all other routes
app.use((req, res, next) => {
  res.status(404).render('404', {
    title: '404 - Page Not Found - Ella Rises',
    isLoggedIn: req.session && req.session.user,
    user: req.session ? req.session.user : null,
  });
});

// 500 error handler - must be last
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).render('500', {
    title: '500 - Server Error - Ella Rises',
    isLoggedIn: req.session && req.session.user,
    user: req.session ? req.session.user : null,
    error: err,
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
