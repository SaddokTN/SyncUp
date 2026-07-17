# SyncUp — Find time together (v2, production-hardened)

A full-stack scheduling app where you and your friends mark your available times and instantly see when everyone's free — now with proper timezone handling, account recovery, and security hardening.

---

## What changed since v1

- **Security:** CSRF tokens on every mutating request, session-fixation fix (regenerated on login/register), rate-limited login (IP + username), generic client-facing error messages (real errors go to the server log), removed unnecessary wildcard CORS, added security headers (CSP, X-Frame-Options, HSTS, nosniff).
- **Account recovery:** password reset via emailed token (`reset.html`), email verification hook on register/email-change.
- **Correctness:** availability is now stored in UTC and converted to/from each user's local timezone, so overlap is meaningful across timezones.
- **Product completeness:** group ownership transfer (no more being stuck as owner), debounced autosave on the availability grid.
- **Performance:** overlap results are cached per group (`group_overlap_cache`) and invalidated only when membership or availability actually changes.
- **Accessibility:** the "everyone free" grid state is now marked with a checkmark glyph, not color alone.
- **Ops:** config now reads from environment variables (`.env`), `schema.sql` is properly tracked in git, added indexes on every hot query path.

---

## File structure

```
syncup/
├── index.html
├── reset.html          ← password reset landing page (linked from reset emails)
├── favicon.svg
├── schema.sql           ← now tracked in git — run once against a fresh DB
├── .env.example         ← copy to .env and fill in real values (never commit .env)
├── .htaccess             ← HTTPS redirect, security headers, static caching
├── css/style.css
├── js/
│   ├── app.js
│   └── timezone.js       ← local <-> UTC conversion for the availability grid
└── api/
    ├── config.php        ← env loading, PDO, sessions, CSRF, rate limiting
    ├── auth.php           ← register/login/logout/me/update/delete + password reset
    ├── availability.php
    └── groups.php         ← + ownership transfer, cached overlap
```

---

## Requirements

- PHP 8.0+ (uses typed properties / `str_contains` / `str_starts_with`)
- MySQL 5.7+ or MariaDB 10.3+
- A real transactional email provider for password reset / verification (Postmark, SES, Mailgun) — `sendResetEmail()` / `issueEmailVerification()` in `api/auth.php` currently just log the link; wire them up before going live.

---

## Setup

### 1. Environment

```bash
cp .env.example .env
# edit .env with real DB credentials and your domain
```

### 2. Database

```bash
mysql -u root -p < schema.sql
```

### 3. Deploy

Copy all files to your web server's document root. Ensure `.env` is **outside** the webroot in production, or confirm your `.htaccess` blocks it (already included).

### 4. Local development

```bash
cd syncup
php -S localhost:8080
```

### 5. Wire up transactional email

Edit `sendResetEmail()` and `issueEmailVerification()` in `api/auth.php` to call your provider's API instead of `error_log()`.

---

## Security notes (updated)

- Passwords hashed with bcrypt, cost 12.
- Every mutating endpoint requires a CSRF token (`X-CSRF-Token` header, fetched via `GET api/auth.php?action=csrf`).
- Sessions regenerate on login/register (fixation protection) and periodically thereafter.
- Login is rate-limited per-IP and per-username; accounts lock for 15 minutes after 8 failed attempts.
- All error responses to the client are generic; real exceptions go to the PHP error log only.
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS) are set in both `api/config.php` and `.htaccess`.
- For horizontal scaling, move PHP sessions to Redis (see the commented-out block in `api/config.php`).

## Known limitations (documented, not hidden)

- Timezone conversion uses the *current* UTC offset for a user's IANA timezone, not the historically correct offset for every day — a recurring slot can be off by an hour for a few days around a DST transition. Fine for "roughly what time works weekly"; not suitable for exact-date calendar booking.
- Email sending is stubbed to the error log — must be connected to a real provider before production use.
