# Major Ink Studios — booking backend

A small Node/Express API that receives booking form submissions, validates
them, stores them, and emails the shop when a new request comes in.

## What's here

- `server.js` — the API (one endpoint that matters: `POST /api/bookings`)
- `data/bookings.json` — every submission is saved here as a backup, even
  if email isn't set up yet or a send fails
- `.env.example` — copy to `.env` and fill in real values
- `GET /api/bookings?key=YOUR_ADMIN_KEY` — a simple way to see all
  submissions in a browser without setting up email at all

## Running it locally

```
npm install
cp .env.example .env   # then fill in real values
node server.js
```

Server runs on `http://localhost:3000` by default (`PORT` in `.env`).

## Connecting the website to it

In `major-ink-site/script.js`, `BOOKING_API_URL` is set to `/api/bookings`
— a relative path. That works automatically if the website and this API
end up served from the same domain. If they're hosted separately (e.g.
website on Netlify, API on Render), change that line to the full API URL,
like `https://major-ink-api.onrender.com/api/bookings`.

## Email setup

Fill in the `SMTP_*` variables in `.env`. Any SMTP provider works:

- **Gmail**: use an [app password](https://myaccount.google.com/apppasswords)
  (not your normal password), host `smtp.gmail.com`, port `587`
- **A transactional email service** (SendGrid, Mailgun, Postmark, etc.) —
  usually the more reliable choice for anything beyond low volume, since
  Gmail can throttle or flag automated sending

Until `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all set, the server
still validates and saves every booking — it just skips the email step
and logs a note. Nothing is lost while credentials get sorted out.

## Deploying

This needs to run somewhere with a persistent Node process — a static
host like Netlify/GitHub Pages can serve the website, but not this API.
Reasonable options:

- **Render** or **Railway** — free/cheap tier, deploy straight from a
  GitHub repo, set the env vars in their dashboard
- **A small VPS** — more control, more setup

Whichever you pick, set the same variables from `.env` in that platform's
environment variable settings — don't commit `.env` itself.

## Notes on what's intentionally simple right now

- Submissions are stored in a JSON file, not a database. Fine at low
  volume; worth moving to a real database (Postgres, SQLite via a proper
  driver) if the shop is getting a lot of requests.
- No calendar sync — this doesn't check availability or book a specific
  slot, it just captures the request for the shop to follow up on. Real
  calendar booking (Square, Vagaro, Cal.com, etc.) is a bigger next step
  if that's wanted.
- Basic rate limiting (5 submissions per IP per 15 minutes) and a
  honeypot field are in place to cut down on spam, but this isn't
  hardened against a determined attacker.
