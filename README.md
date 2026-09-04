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
website on Netlify, API on Railway), change that line to the full API URL,
like `https://major-ink-backend-production.up.railway.app/api/bookings`.

## Email setup (via Resend)

Email is sent through [Resend](https://resend.com)'s HTTPS API rather than
traditional SMTP. This matters if you're deploying to Railway: Railway
blocks outbound SMTP (ports 25, 465, 587) on its Free, Trial, and Hobby
plans, so a normal SMTP setup (Gmail, etc.) will silently time out there.
An HTTPS API call like Resend's isn't affected by that restriction.

1. Sign up free at resend.com
2. Go to **API Keys** and create one — copy it into `RESEND_API_KEY`
3. Set `SHOP_NOTIFICATION_EMAIL` to whichever address should receive
   booking alerts
4. Leave `RESEND_FROM_EMAIL` as `onboarding@resend.com` to start — this
   only works when sending **to the same email you signed up to Resend
   with**. If you want to send to a different address, you'll need to
   verify your own domain in Resend's dashboard first, then set
   `RESEND_FROM_EMAIL` to something like `bookings@majorinkstudios.com`

Until `RESEND_API_KEY` is set, the server still validates and saves every
booking — it just skips the email step and logs a note. Nothing is lost
while that gets set up.

## Deploying

This needs to run somewhere with a persistent Node process — a static
host like Netlify/GitHub Pages can serve the website, but not this API.

- **Railway** or **Render** — free/cheap tier, deploy straight from a
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
