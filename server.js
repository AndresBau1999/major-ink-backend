require('dotenv').config({ quiet: true }); // quiet: true suppresses dotenv's console tips
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');

// ---------- setup ----------
// The website and this API will likely live on different domains
// (e.g. Netlify for the site, Render for the API). ALLOWED_ORIGIN in
// .env should be the exact site URL, e.g. https://major-ink-studios.netlify.app
// If ALLOWED_ORIGIN isn't set, all origins are allowed (fine for local
// testing, but set it once you're live).
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

// Basic abuse protection: 5 submissions per IP per 15 min
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests from this device. Try again later.' }
});

// ---------- email transport ----------
// Configure via .env — see .env.example. If SMTP vars are missing, the
// server still accepts and stores bookings, it just skips the email step
// and logs a warning, so nothing is lost while you get credentials set up.
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000, // fail fast instead of hanging on a bad host/port
    greetingTimeout: 8000,
    socketTimeout: 8000
  });
}

async function notifyShop(booking) {
  if (!transporter) {
    console.warn('SMTP not configured — skipping email notification. Booking was still saved.');
    return;
  }
  const to = process.env.SHOP_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn('SHOP_NOTIFICATION_EMAIL not set — skipping email notification.');
    return;
  }
  const lines = [
    `New booking request from ${booking.name}`,
    '',
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Preferred artist: ${booking.artist || 'No preference'}`,
    `Style: ${booking.style}`,
    `Placement: ${booking.placement || 'Not specified'}`,
    '',
    'Details:',
    booking.details,
    '',
    `Submitted: ${booking.submittedAt}`
  ];
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    replyTo: booking.email,
    subject: `New booking request — ${booking.name}`,
    text: lines.join('\n')
  });
}

// ---------- validation ----------
function validateBooking(body) {
  const errors = {};
  const required = ['name', 'phone', 'email', 'style', 'details'];
  required.forEach((field) => {
    if (!body[field] || !String(body[field]).trim()) {
      errors[field] = 'This field is required.';
    }
  });
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (body.phone && String(body.phone).replace(/\D/g, '').length < 7) {
    errors.phone = 'Enter a valid phone number.';
  }
  // simple honeypot field, see booking.html hidden input "website"
  if (body.website) {
    errors._bot = 'Rejected.';
  }
  return errors;
}

// ---------- routes ----------
app.post('/api/bookings', bookingLimiter, async (req, res) => {
  const errors = validateBooking(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const booking = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: String(req.body.name).trim(),
    phone: String(req.body.phone).trim(),
    email: String(req.body.email).trim(),
    artist: req.body.artist ? String(req.body.artist).trim() : '',
    style: String(req.body.style).trim(),
    placement: req.body.placement ? String(req.body.placement).trim() : '',
    details: String(req.body.details).trim(),
    submittedAt: new Date().toISOString(),
    status: 'new'
  };

  const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  all.unshift(booking);
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));

  // Respond to the customer immediately once the booking is saved — don't
  // make them wait on email, which can be slow or fail independently.
  res.json({ ok: true, id: booking.id });

  // Fire the notification email in the background. If it fails, the
  // booking is still safely saved above and visible via /api/bookings.
  notifyShop(booking).catch((err) => {
    console.error('Email send failed (booking was still saved):', err.message);
  });
});

// Simple protected view for the shop to see submissions without email.
// Visit /api/bookings?key=YOUR_ADMIN_KEY
app.get('/api/bookings', (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(all);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Major Ink backend running on port ${PORT}`));

module.exports = app;
