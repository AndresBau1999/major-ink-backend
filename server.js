require('dotenv').config({ quiet: true }); // quiet: true suppresses dotenv's console tips
const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');

// Railway (and most hosting platforms) sit behind a proxy, so the app
// needs to trust the X-Forwarded-For header to correctly identify each
// visitor's real IP — required for express-rate-limit to work properly.
app.set('trust proxy', 1);

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

// ---------- email ----------
// Sends via Resend's HTTPS API (https://resend.com) instead of raw SMTP —
// Railway blocks outbound SMTP ports on Free/Trial/Hobby plans, but a
// plain HTTPS request like this works everywhere with no plan restriction.
// Configure via .env — see .env.example. If RESEND_API_KEY is missing, the
// server still accepts and stores bookings, it just skips the email step
// and logs a warning, so nothing is lost while you get an API key set up.
async function notifyShop(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SHOP_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.com';

  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email notification. Booking was still saved.');
    return;
  }
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: booking.email,
        subject: `New booking request — ${booking.name}`,
        text: lines.join('\n')
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend API returned ${response.status}: ${body}`);
  }
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
    console.error('Email send failed (booking was still saved):', err.code || err.message, '-', err.message);
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
