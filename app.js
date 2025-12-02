// ============================================
// ELLA RISES WEB APPLICATION
// ============================================
// A full-stack Node.js/Express application for Ella Rises organization
// Built with: Express, EJS, Knex, PostgreSQL, express-session, bcrypt

// Load environment variables
require('dotenv').config();

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

// ============================================
// KNEX DATABASE SETUP
// ============================================
// Configure Knex to connect to PostgreSQL
// Connection details come from environment variables
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
});

// Expected database schema (for reference):
//
// users table:
//   - id (primary key)
//   - name (string)
//   - email (string, unique)
//   - password_hash (string)
//   - role (string: 'user' or 'admin')
//   - login_count (integer, default 0)
//
// events table:
//   - id (primary key)
//   - title (string)
//   - description (text)
//   - date (timestamp)
//   - location (string)
//   - capacity (integer)
//
// event_registrations table:
//   - id (primary key)
//   - user_id (foreign key to users)
//   - event_id (foreign key to events)
//   - created_at (timestamp)
//
// surveys table:
//   - id (primary key)
//   - user_id (foreign key)
//   - event_id (foreign key)
//   - rating (integer)
//   - feedback (text)
//   - created_at (timestamp)
//
// milestones table:
//   - id (primary key)
//   - title (string)
//   - description (text)
//
// participant_milestones table:
//   - id (primary key)
//   - user_id (foreign key)
//   - milestone_id (foreign key)
//   - achieved_at (timestamp)
//
// donations table:
//   - id (primary key)
//   - user_id (foreign key, nullable for anonymous donations)
//   - amount (decimal)
//   - created_at (timestamp)

// Ensure donations table has donation_date column to support imported dates
async function ensureDonationDateColumn() {
  try {
    const hasDonationDate = await knex.schema.hasColumn('donations', 'donation_date');
    if (!hasDonationDate) {
      await knex.schema.alterTable('donations', (table) => {
        table.timestamp('donation_date').defaultTo(knex.fn.now());
      });
      await knex('donations').update({ donation_date: knex.raw('created_at') });
      console.log('Added donation_date column and backfilled from created_at');
    }
  } catch (err) {
    console.error('Error ensuring donation_date column:', err);
  }
}
ensureDonationDateColumn();

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// EMAIL (NODEMAILER) SETUP
// ============================================
// Configure a reusable transporter for contact form submissions.
const mailTransporter =
  process.env.MAIL_HOST && (process.env.MAIL_FROM || process.env.MAIL_USER)
    ? nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT, 10) || 587,
        secure:
          process.env.MAIL_SECURE === 'true' ||
          parseInt(process.env.MAIL_PORT, 10) === 465,
        auth:
          process.env.MAIL_USER && process.env.MAIL_PASS
            ? {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
              }
            : undefined,
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
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies
app.use(express.json());

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
    const user = await knex('users').where({ email }).first();

    if (!user) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Compare password with hashed password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Increment login count
    await knex('users')
      .where({ id: user.id })
      .increment('login_count', 1);

    // Store user in session (don't store password_hash)
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Redirect based on role
    if (user.role === 'admin') {
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
  });
});

// Handle signup form submission
app.post('/signup', async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  try {
    // Validate passwords match
    if (password !== confirmPassword) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'Passwords do not match',
      });
    }

    // Check if user already exists
    const existingUser = await knex('users').where({ email }).first();

    if (existingUser) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'An account with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert new user (default role is 'user')
    const [newUser] = await knex('users')
      .insert({
        name,
        email,
        password_hash,
        role: 'user',
        login_count: 0,
      })
      .returning('*');

    // Log the user in immediately
    req.session.user = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    };

    res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', {
      title: 'Sign Up - Ella Rises',
      error: 'An error occurred. Please try again.',
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
    // Get all events from database, ordered by start time
    const events = await knex('events')
      .select('*')
      .orderBy('start_time', 'asc');

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
    const event = await knex('events')
      .where({ id: eventId })
      .first();

    if (!event) {
      return res.status(404).send('Event not found');
    }

    // Check if current user is already registered (if logged in)
    let isRegistered = false;
    if (req.session.user) {
      const registration = await knex('event_registrations')
        .where({
          user_id: req.session.user.id,
          event_id: eventId,
        })
        .first();

      isRegistered = !!registration;
    }

    res.render('events/detail', {
      title: `${event.title} - Ella Rises`,
      event,
      isRegistered,
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
    // Check if already registered
    const existing = await knex('event_registrations')
      .where({
        user_id: userId,
        event_id: eventId,
      })
      .first();

    if (existing) {
      return res.redirect(`/events/${eventId}?message=already_registered`);
    }

    // Insert registration
    await knex('event_registrations').insert({
      user_id: userId,
      event_id: eventId,
      created_at: new Date(),
    });

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
  const { donor_name, donor_email, amount, message } = req.body;

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

    // Insert donation (user_id is null for visitor donations)
    await knex('donations').insert({
      user_id: null,
      amount: donationAmount,
      donor_name: donor_name || 'Anonymous',
      donor_email: donor_email || null,
      message: message || null,
      created_at: new Date(),
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
    const registeredEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*', 'event_registrations.created_at as registered_at')
      .orderBy('events.start_time', 'asc');

    // Get user's milestones
    const userMilestones = await knex('participant_milestones')
      .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', req.session.user.id)
      .select('milestones.*', 'participant_milestones.custom_title', 'participant_milestones.achieved_at')
      .orderBy('participant_milestones.achieved_at', 'desc');

    res.render('user/dashboard', {
      title: 'My Rise - Ella Rises',
      registeredEvents,
      userMilestones,
    });
  } catch (error) {
    console.error('Error loading user dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// User's events page
app.get('/user/events', requireLogin, async (req, res) => {
  try {
    const registeredEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*', 'event_registrations.created_at as registered_at')
      .orderBy('events.start_time', 'asc');

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
    const userMilestones = await knex('participant_milestones')
      .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', req.session.user.id)
      .select('milestones.*', 'participant_milestones.custom_title', 'participant_milestones.achieved_at', 'participant_milestones.id as user_milestone_id')
      .orderBy('participant_milestones.achieved_at', 'desc');

    // Get all milestone categories for the add form
    const milestoneCategories = await knex('milestones')
      .select('*')
      .orderBy('id', 'asc');

    res.render('user/milestones', {
      title: 'My Milestones - Ella Rises',
      milestones: userMilestones,
      categories: milestoneCategories,
    });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).send('Error loading milestones');
  }
});

// Add milestone - POST route
app.post('/user/milestones', requireLogin, async (req, res) => {
  const { milestone_id, custom_title, achieved_date } = req.body;

  try {
    await knex('participant_milestones').insert({
      user_id: req.session.user.id,
      milestone_id: parseInt(milestone_id),
      custom_title: custom_title,
      achieved_at: achieved_date ? new Date(achieved_date) : new Date(),
    });

    res.redirect('/user/milestones?success=true');
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.redirect('/user/milestones?error=true');
  }
});

// Survey page - show form to submit post-event survey
app.get('/user/survey', requireLogin, async (req, res) => {
  try {
    // Get events the user has attended
    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

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
    // Calculate overall score as average of all 4 ratings
    const sat = parseInt(satisfaction_rating);
    const use = parseInt(usefulness_rating);
    const inst = parseInt(instructor_rating);
    const rec = parseInt(recommendation_rating);
    const overall_score = (sat + use + inst + rec) / 4;

    await knex('surveys').insert({
      user_id: req.session.user.id,
      event_id: parseInt(event_id),
      satisfaction_rating: sat,
      usefulness_rating: use,
      instructor_rating: inst,
      recommendation_rating: rec,
      overall_score: overall_score,
      additional_feedback,
      created_at: new Date(),
    });

    // Get events again to re-render the form
    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: 'Thank you for your feedback!',
      error: null,
    });
  } catch (error) {
    console.error('Error submitting survey:', error);

    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

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
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.render('admin/dashboard', {
    title: 'Admin Dashboard - Ella Rises',
  });
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

    let query = knex('users').select('*');
    let countQuery = knex('users').count('* as count');

    // Apply search filter if provided
    if (search) {
      const searchFilter = function () {
        this.where('name', 'ilike', `%${search}%`).orWhere('email', 'ilike', `%${search}%`);
      };
      query = query.where(searchFilter);
      countQuery = countQuery.where(searchFilter);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const users = await query.orderBy('name', 'asc').limit(limit).offset(offset);

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
    user: null,
    error: null,
  });
});

// Admin - Create new user
app.post('/admin/participants/new/user', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if user already exists
    const existingUser = await knex('users').where({ email }).first();

    if (existingUser) {
      return res.render('admin/user-form', {
        title: 'Create New User - Admin - Ella Rises',
        user: null,
        error: 'A user with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    await knex('users').insert({
      name,
      email,
      password_hash: hashedPassword,
      role: role || 'user',
      created_at: new Date(),
    });

    res.redirect('/admin/participants?success=created');
  } catch (error) {
    console.error('Error creating user:', error);
    res.render('admin/user-form', {
      title: 'Create New User - Admin - Ella Rises',
      user: null,
      error: 'Error creating user. Please try again.',
    });
  }
});

// Admin participant detail - shows comprehensive user information
app.get('/admin/participants/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    // Get user details
    const user = await knex('users').where({ id: userId }).first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Get events this user has registered for (with attendance status)
    const userEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', userId)
      .select(
        'events.*',
        'event_registrations.created_at as registered_at',
        'event_registrations.attendance_status',
        'event_registrations.check_in_time'
      )
      .orderBy('events.start_time', 'desc');

    // Get enrolled programs
    const enrolledPrograms = await knex('program_enrollments')
      .join('programs', 'program_enrollments.program_id', 'programs.id')
      .where('program_enrollments.user_id', userId)
      .select('programs.*', 'program_enrollments.enrolled_at', 'program_enrollments.status')
      .orderBy('program_enrollments.enrolled_at', 'desc');

    // Get all donations by this user
    const userDonations = await knex('donations')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    // Get all milestones achieved
    const userMilestones = await knex('participant_milestones')
      .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', userId)
      .select(
        'participant_milestones.*',
        'milestones.title as milestone_title',
        'milestones.description as milestone_description'
      )
      .orderBy('participant_milestones.achieved_at', 'desc');

    // Get all surveys filled out
    const userSurveys = await knex('surveys')
      .join('events', 'surveys.event_id', 'events.id')
      .where('surveys.user_id', userId)
      .select('surveys.*', 'events.title as event_title')
      .orderBy('surveys.created_at', 'desc');

    res.render('admin/participantDetail', {
      title: `${user.name} - Participants - Admin - Ella Rises`,
      participant: user,
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
    const user = await knex('users').where({ id: userId }).first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.render('admin/user-form', {
      title: 'Edit User - Admin - Ella Rises',
      user,
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
    const existingUser = await knex('users')
      .where({ email })
      .whereNot({ id: userId })
      .first();

    if (existingUser) {
      const user = await knex('users').where({ id: userId }).first();
      return res.render('admin/user-form', {
        title: 'Edit User - Admin - Ella Rises',
        user,
        error: 'This email is already in use by another user',
      });
    }

    // Update user
    await knex('users')
      .where({ id: userId })
      .update({
        name,
        email,
        role,
      });

    res.redirect(`/admin/participants/${userId}?success=updated`);
  } catch (error) {
    console.error('Error updating user:', error);
    const user = await knex('users').where({ id: userId }).first();
    res.render('admin/user-form', {
      title: 'Edit User - Admin - Ella Rises',
      user,
      error: 'Error updating user. Please try again.',
    });
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

    await knex('users').where({ id: userId }).del();

    res.redirect('/admin/participants?success=deleted');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.redirect('/admin/participants?error=delete_failed');
  }
});

// ============================================
// ADMIN - EVENTS MANAGEMENT
// ============================================

// Admin events page - view/manage all events
app.get('/admin/events', requireAdmin, async (req, res) => {
  try {
    const { search = '', page = 1 } = req.query;
    const limit = 25;
    const offset = (parseInt(page) - 1) * limit;

    let query = knex('events').select('*');
    let countQuery = knex('events').count('* as count');

    if (search) {
      const searchFilter = function() {
        this.where('title', 'ilike', `%${search}%`)
            .orWhere('description', 'ilike', `%${search}%`)
            .orWhere('location', 'ilike', `%${search}%`);
      };
      query = query.where(searchFilter);
      countQuery = countQuery.where(searchFilter);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const events = await query.orderBy('date', 'asc').limit(limit).offset(offset);

    res.render('admin/events', {
      title: 'Events - Admin - Ella Rises',
      events,
      search,
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
  });
});

// Admin - Create new event
app.post('/admin/events/new', requireAdmin, upload.single('event_image'), async (req, res) => {
  const { title, description, date, start_time, end_time, location, capacity } = req.body;

  try {
    const eventData = {
      title,
      description,
      start_time: new Date(start_time || date), // Support both old 'date' and new 'start_time'
      end_time: end_time ? new Date(end_time) : null,
      location,
      capacity: capacity ? parseInt(capacity) : null,
      image_url: req.file ? `/images/events/${req.file.filename}` : null,
    };

    await knex('events').insert(eventData);
    res.redirect('/admin/events?success=created');
  } catch (error) {
    console.error('Error creating event:', error);
    res.render('admin/event-form', {
      title: 'Create New Event - Admin - Ella Rises',
      event: null,
      error: 'Failed to create event. Please try again.',
    });
  }
});

// Admin - Edit event form
app.get('/admin/events/:id/edit', requireAdmin, async (req, res) => {
  try {
    const event = await knex('events').where('id', req.params.id).first();
    if (!event) {
      return res.status(404).send('Event not found');
    }

    res.render('admin/event-form', {
      title: 'Edit Event - Admin - Ella Rises',
      event,
      error: null,
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
    const eventData = {
      title,
      description,
      start_time: new Date(start_time || date), // Support both old 'date' and new 'start_time'
      end_time: end_time ? new Date(end_time) : null,
      location,
      capacity: capacity ? parseInt(capacity) : null,
    };

    // Only update image if new one uploaded
    if (req.file) {
      eventData.image_url = `/images/events/${req.file.filename}`;
    }

    await knex('events').where('id', req.params.id).update(eventData);
    res.redirect('/admin/events?success=updated');
  } catch (error) {
    console.error('Error updating event:', error);
    const event = await knex('events').where('id', req.params.id).first();
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
    await knex('events').where('id', req.params.id).delete();
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

    let query = knex('surveys')
      .join('users', 'surveys.user_id', 'users.id')
      .join('events', 'surveys.event_id', 'events.id')
      .select('surveys.*', 'users.name as user_name', 'events.title as event_title');

    let countQuery = knex('surveys')
      .join('users', 'surveys.user_id', 'users.id')
      .join('events', 'surveys.event_id', 'events.id')
      .count('surveys.id as count');

    // Apply event search filter
    if (search_event) {
      const filter = builder => builder.where('events.title', 'ilike', `%${search_event}%`);
      query = query.where(filter);
      countQuery = countQuery.where(filter);
    }

    // Apply participant search filter
    if (search_participant) {
      const filter = builder => builder.where('users.name', 'ilike', `%${search_participant}%`);
      query = query.where(filter);
      countQuery = countQuery.where(filter);
    }

    // Apply NPS filter
    if (filter_nps) {
      if (filter_nps === 'Promoter') {
        query = query.where('surveys.recommendation_rating', '=', 5);
        countQuery = countQuery.where('surveys.recommendation_rating', '=', 5);
      } else if (filter_nps === 'Passive') {
        query = query.where('surveys.recommendation_rating', '=', 4);
        countQuery = countQuery.where('surveys.recommendation_rating', '=', 4);
      } else if (filter_nps === 'Detractor') {
        query = query.where('surveys.recommendation_rating', '<=', 3);
        countQuery = countQuery.where('surveys.recommendation_rating', '<=', 3);
      }
    }

    // Apply sorting
    const sortField = sort_by || 'created_at';
    const order = sort_order || 'desc';

    if (sortField === 'overall_score') {
      query = query.orderBy('surveys.overall_score', order);
    } else if (sortField === 'date') {
      query = query.orderBy('surveys.created_at', order);
    } else {
      query = query.orderBy('surveys.created_at', order);
    }

    const [{ count }] = await countQuery;
    const totalRecords = parseInt(count);
    const totalPages = Math.ceil(totalRecords / limit);
    const surveys = await query.limit(limit).offset(offset);

    // Get all events and users for dropdowns
    const events = await knex('events')
      .distinct('title')
      .orderBy('title', 'asc');

    const users = await knex('users')
      .where('role', 'user')
      .select('id', 'name')
      .orderBy('name', 'asc');

    // Add net_promoter_score to each survey
    surveys.forEach(survey => {
      if (survey.recommendation_rating <= 3) {
        survey.net_promoter_score = 'Detractor';
      } else if (survey.recommendation_rating === 4) {
        survey.net_promoter_score = 'Passive';
      } else {
        survey.net_promoter_score = 'Promoter';
      }
    });

    res.render('admin/surveys', {
      title: 'Surveys - Admin - Ella Rises',
      surveys,
      events,
      users,
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
    const users = await knex('users').select('id', 'name').orderBy('name');
    const events = await knex('events').select('id', 'title').orderBy('title');

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
    const overall_score = ((parseInt(satisfaction_rating) + parseInt(usefulness_rating) + parseInt(instructor_rating) + parseInt(recommendation_rating)) / 4).toFixed(2);

    await knex('surveys').insert({
      user_id,
      event_id,
      satisfaction_rating,
      usefulness_rating,
      instructor_rating,
      recommendation_rating,
      overall_score,
      additional_feedback,
      created_at: new Date(),
    });

    res.redirect('/admin/surveys?success=created');
  } catch (error) {
    console.error('Error creating survey:', error);
    const users = await knex('users').select('id', 'name').orderBy('name');
    const events = await knex('events').select('id', 'title').orderBy('title');
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
    const survey = await knex('surveys')
      .join('users', 'surveys.user_id', 'users.id')
      .join('events', 'surveys.event_id', 'events.id')
      .select('surveys.*', 'users.name as user_name', 'users.email as user_email', 'events.title as event_title')
      .where('surveys.id', surveyId)
      .first();

    if (!survey) {
      return res.status(404).send('Survey not found');
    }

    // Calculate net_promoter_score
    if (survey.recommendation_rating <= 3) {
      survey.net_promoter_score = 'Detractor';
    } else if (survey.recommendation_rating === 4) {
      survey.net_promoter_score = 'Passive';
    } else {
      survey.net_promoter_score = 'Promoter';
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
app.get('/admin/surveys/:id/edit', requireAdmin, async (req, res) => {
  try {
    const survey = await knex('surveys').where('id', req.params.id).first();
    if (!survey) {
      return res.status(404).send('Survey not found');
    }

    const users = await knex('users').select('id', 'name').orderBy('name');
    const events = await knex('events').select('id', 'title').orderBy('title');

    res.render('admin/survey-form', {
      title: 'Edit Survey - Admin - Ella Rises',
      survey,
      users,
      events,
      error: null,
    });
  } catch (error) {
    console.error('Error loading survey:', error);
    res.status(500).send('Error loading survey');
  }
});

// Admin - Update survey
app.post('/admin/surveys/:id/edit', requireAdmin, async (req, res) => {
  const { user_id, event_id, satisfaction_rating, usefulness_rating, instructor_rating, recommendation_rating, additional_feedback } = req.body;

  try {
    const overall_score = ((parseInt(satisfaction_rating) + parseInt(usefulness_rating) + parseInt(instructor_rating) + parseInt(recommendation_rating)) / 4).toFixed(2);

    await knex('surveys')
      .where('id', req.params.id)
      .update({
        user_id,
        event_id,
        satisfaction_rating,
        usefulness_rating,
        instructor_rating,
        recommendation_rating,
        overall_score,
        additional_feedback,
      });

    res.redirect(`/admin/surveys/${req.params.id}?success=updated`);
  } catch (error) {
    console.error('Error updating survey:', error);
    const survey = await knex('surveys').where('id', req.params.id).first();
    const users = await knex('users').select('id', 'name').orderBy('name');
    const events = await knex('events').select('id', 'title').orderBy('title');
    res.render('admin/survey-form', {
      title: 'Edit Survey - Admin - Ella Rises',
      survey,
      users,
      events,
      error: 'Error updating survey. Please try again.',
    });
  }
});

// Admin - Delete survey
app.post('/admin/surveys/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('surveys').where('id', req.params.id).del();
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

    // Get all milestone categories
    const milestoneCategories = await knex('milestones')
      .select('*')
      .orderBy('id', 'asc');

    // Build query for users (non-admin participants)
    let usersQuery = knex('users')
      .where('role', 'user')
      .orderBy('name', 'asc');

    let countQuery = knex('users')
      .where('role', 'user')
      .count('* as count');

    // Apply search filter
    if (search) {
      const filter = builder => builder.where('name', 'ilike', `%${search}%`);
      usersQuery = usersQuery.where(filter);
      countQuery = countQuery.where(filter);
    }

    const users = await usersQuery;

    // Get all user milestones
    const userMilestones = await knex('participant_milestones')
      .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .select(
        'participant_milestones.user_id',
        'participant_milestones.milestone_id',
        'participant_milestones.custom_title',
        'participant_milestones.achieved_at',
        'milestones.title as milestone_title'
      );

    // Build a map of user achievements: user_id -> milestone_id -> [milestones]
    const userAchievements = {};
    userMilestones.forEach(um => {
      if (!userAchievements[um.user_id]) {
        userAchievements[um.user_id] = {};
      }
      if (!userAchievements[um.user_id][um.milestone_id]) {
        userAchievements[um.user_id][um.milestone_id] = [];
      }
      userAchievements[um.user_id][um.milestone_id].push(um);
    });

    // Filter by milestone if specified
    let filteredUsers = users;
    if (filter_milestone) {
      filteredUsers = users.filter(user => {
        return userAchievements[user.id] && userAchievements[user.id][filter_milestone];
      });
    }

    // Paginate filtered users
    const totalRecords = filteredUsers.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const paginatedUsers = filteredUsers.slice(offset, offset + limit);

    res.render('admin/milestones', {
      title: 'Milestones - Admin - Ella Rises',
      users: paginatedUsers,
      milestoneCategories,
      userAchievements,
      search: search || '',
      filter_milestone: filter_milestone || '',
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
    const user = await knex('users')
      .where('id', userId)
      .first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    const userMilestones = await knex('participant_milestones')
      .leftJoin('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', userId)
      .select(
        'participant_milestones.*',
        'milestones.title as milestone_title',
        'milestones.description as milestone_description'
      )
      .orderBy('participant_milestones.achieved_at', 'desc');

    res.render('admin/user-milestones', {
      title: `${user.name}'s Milestones - Admin - Ella Rises`,
      user,
      milestones: userMilestones,
    });
  } catch (error) {
    console.error('Error loading user milestones:', error);
    res.status(500).send('Error loading user milestones');
  }
});

// Admin - Create milestone category
app.post('/admin/milestones/create', requireAdmin, async (req, res) => {
  const { title, description } = req.body;

  try {
    await knex('milestones').insert({
      title,
      description,
      created_at: new Date(),
    });

    res.redirect('/admin/milestones?success=created');
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.redirect('/admin/milestones?error=create_failed');
  }
});

// Admin - Update milestone category
app.post('/admin/milestones/:id/edit', requireAdmin, async (req, res) => {
  const { title, description } = req.body;

  try {
    await knex('milestones')
      .where('id', req.params.id)
      .update({ title, description });

    res.redirect('/admin/milestones?success=updated');
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.redirect('/admin/milestones?error=update_failed');
  }
});

// Admin - Delete milestone category
app.post('/admin/milestones/:id/delete', requireAdmin, async (req, res) => {
  try {
    await knex('milestones').where('id', req.params.id).del();
    res.redirect('/admin/milestones?success=deleted');
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
      .leftJoin('users', 'donations.user_id', 'users.id')
      .select('donations.*', 'users.name as user_name');

    let countQuery = knex('donations')
      .leftJoin('users', 'donations.user_id', 'users.id')
      .count('donations.id as count');

    let totalQuery = knex('donations')
      .leftJoin('users', 'donations.user_id', 'users.id')
      .sum('donations.amount as total');

    // Apply search filter
    if (search) {
      query = query.where(function () {
        this.whereRaw("COALESCE(users.name, donations.donor_name, '') ILIKE ?", [`%${search}%`])
          .orWhereRaw('donations.amount::text ILIKE ?', [`%${search}%`]);
      });
      countQuery = countQuery.where(function () {
        this.whereRaw("COALESCE(users.name, donations.donor_name, '') ILIKE ?", [`%${search}%`])
          .orWhereRaw('donations.amount::text ILIKE ?', [`%${search}%`]);
      });
      totalQuery = totalQuery.where(function () {
        this.whereRaw("COALESCE(users.name, donations.donor_name, '') ILIKE ?", [`%${search}%`])
          .orWhereRaw('donations.amount::text ILIKE ?', [`%${search}%`]);
      });
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
      .orderByRaw('COALESCE(donations.donation_date, donations.created_at) DESC, donations.id DESC')
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
  const { user_id, amount, donor_name, donor_email, message, donation_date } = req.body;

  try {
    await knex('donations').insert({
      user_id: user_id || null,
      amount: parseFloat(amount),
      donor_name: donor_name || 'Anonymous',
      donor_email: donor_email || null,
      message: message || null,
      donation_date: donation_date ? new Date(donation_date) : new Date(),
    });

    res.redirect('/admin/donations?success=created');
  } catch (error) {
    console.error('Error creating donation:', error);
    res.redirect('/admin/donations?error=create_failed');
  }
});

// Admin - Update donation
app.post('/admin/donations/:id/edit', requireAdmin, async (req, res) => {
  const { user_id, amount, donor_name, donor_email, message, donation_date } = req.body;

  try {
    await knex('donations')
      .where('id', req.params.id)
      .update({
        user_id: user_id || null,
        amount: parseFloat(amount),
        donor_name: donor_name || 'Anonymous',
        donor_email,
        message,
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
    await knex('donations').where('id', req.params.id).del();
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
// ERROR HANDLING
// ============================================

// 418 I'm a teapot - Easter egg route (required for IS 404 rubric)
app.get('/teapot', (req, res) => {
  res.status(418).render('teapot', {
    title: "I'm a Teapot - Ella Rises",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
