# Repvo static preview

The default deployment is a static site with bundled pricing, foods, team profiles, articles and English/Arabic sample plans. No server, database or environment variables are required at runtime. Sign-in, payments, email and bookings are unavailable. Form entries do not customize the sample plan or create an order.

Run `npm run build` to generate `dist/`. Run `npm start` to preview it at http://localhost:3000, or serve dist with any static file server. Node is used only during the build and for optional local preview tooling.

Vercel uses the included vercel.json: framework **Other**, build command `npm run build`, output directory `dist`. Redeploy to apply these settings. No runtime start command or environment variables are needed.

Edit sample settings and plan profiles in scripts/build-static.cjs, articles and team profiles in lib/blog.js, and site content in public/. Rebuild after changes. The original backend remains in source for future restoration and is excluded from dist.

---

## Original server documentation (for future backend restoration)

# Repvo

Low-price workout and nutrition plans, generated from the client's numbers, sold online.

- **Website** (`/`): landing page, pricing, FAQ and the plan builder (`/#start`).
- **Checkout**: price is calculated on the server, the client pays on Paymob or Stripe, and the plan unlocks only after the payment is confirmed.
- **Plan page** (`/plan/<private link>`): targets, meals with exact grams, one-tap food swaps, training plan, print / save as PDF. The link is emailed to the client.
- **Coach calls**: real calendar with your working days and hours; a time is held while the client pays and can't be double-booked.
- **Coach follow-up** ($50/month): a weekly check-in plus one call every week, which the client books from the Coach tab on their plan page (one per week, weeks start Saturday, cancel up to 24 h before). Monthly. Stripe charges the card automatically; with Paymob the client gets a payment link by email on the renewal day, and you're told if they don't pay within 7 days.
- **Add-ons** (prices set in admin): **training tracker** ($3: kg × reps per set, estimated-1RM progress, history), **nutrition tracker** ($3: log from 125+ foods incl. Egyptian dishes, fast food, sweets and drinks, or a planned meal in one tap, with daily totals against targets), **exercise videos** ($10: your own video beside each exercise, plus form cues), **healthy recipes** ($5: a recipe for every meal using its exact foods and grams), **supplements guide** ($5: creatine, protein, vitamin D, omega-3, caffeine and more, with doses for the client's weight, plus what to skip), **cardio plan** ($8: heart-rate zones from the client's age, a weekly schedule placed around their lifting days with no hard cardio before leg day, sessions that progress over 4 weeks, a daily step goal, low-impact options for higher body weight or age 50+). Bought at checkout or later from the plan page.
- **Training split by days**: the client picks 2 to 6 training days. 2 = upper / lower; 3 = push / pull / legs; 4 = upper / lower with a different A and B version of each day (no repeated exercises); 5 = pro split (chest, back, shoulders, legs, arms); 6 = push / pull / legs twice. Every exercise has gym, home-dumbbell and bodyweight versions.
- **English or Arabic**: the client picks the program language in the form. Arabic programs come right to left, with Arabic food names, recipes, exercises, form cues, trackers, supplements guide and emails. Arabic names and recipe steps for your own foods can be added in Admin → Food database.
- **Health check**: heart condition or chest pain, dizziness or fainting, uncontrolled high blood pressure, pregnancy, diabetes on insulin, kidney/liver disease, surgery or a serious injury in the last 6 months, or under 18 → no automatic plan; the client must book a call.
- **Pain and old injuries** (neck, shoulder, elbow, wrist, lower back, hip, knee, ankle): the plan stays automatic, but every exercise that loads the area is swapped for a safe version the client can do with their equipment, or left out and replaced with a safe exercise from the same day. The plan page lists what changed. Knee, hip, ankle or lower-back pain also makes the cardio plan low-impact. Free-text medical notes go to the coach (admin and the new-order email).
- **Admin** (`/admin`, password protected): revenue, orders, client details with WhatsApp links, calls (mark done, move, cancel), follow-ups (stop), prices, call hours, exchange rate, food database, sent emails.

- **My plans and the phone apps** (`/account`): clients sign in with the email they ordered with (a 6-digit code by email, no password) and see every plan they bought, then open meals, workouts, trackers and coach calls. They can sign out or delete their account (removes their personal data and plans, stops follow-up, keeps payment amounts for your records). The site is installable on phones (Add to Home Screen) and keeps opened plans readable offline. The iPhone and Android apps (separate `repvo-app` folder) open this page; inside them nothing is sold. The server spots the apps by "RepvoApp" in the user agent and hides prices, add-ons and receipts. For store reviewers set `REVIEW_EMAIL` and `REVIEW_CODE` (6 digits) so they can sign in without email.

- **Team and blog**: the home page has a "Built by a well-educated team" section (team cards edited in Admin → Team, plus how every plan is built) and the latest three articles. The blog lives at `/blog` (English and Arabic, server-rendered for Google, with `sitemap.xml` and an RSS feed at `/blog/feed.xml`). Write and publish articles in Admin → Blog with simple formatting and a live preview. Five starter articles are included; edit or delete them.

No outside packages: it runs on Node.js 22.13 or newer and keeps its data in one SQLite file.

## Try it on your computer

```bash
npm run dev
```

Open http://localhost:3000. Payments are in **test mode** (a fake payment page, nobody is charged) and the admin password is `admin`. Emails are not sent; you can read them in Admin → Emails.

Run the automatic tests (34 checks of every flow):

```bash
npm test
```

## Launch checklist

1. **Host it.** Any host that runs Node 22 or Docker and has a **persistent disk** for the database:
   - **Railway** or **Render**: new service from this folder (or a GitHub repo), add a volume/disk mounted at `/data`, set `DB_PATH=/data/fitplan.db`. The included `Dockerfile` works as is.
   - **VPS** (DigitalOcean, Hetzner…): install Node 22, copy the folder, create `.env`, run `npm start` under `pm2` or systemd, put Nginx or Caddy in front for HTTPS.
2. **Set the settings** from `.env.example` on the host. At minimum: `BASE_URL` (your real https address), `ADMIN_PASSWORD`, `APP_SECRET`.
3. **Payments: Paymob** (recommended for an Egyptian business).
   - In the Paymob dashboard, copy the secret key, public key and HMAC secret, and the integration ID(s) you want at checkout (card, mobile wallet…).
   - Set `PAYMENT_PROVIDER=paymob` and the `PAYMOB_*` values.
   - Currency: if your integrations are EGP, keep `PAYMOB_CURRENCY=EGP` and set the dollar rate in Admin → Prices & hours (the checkout shows the client the EGP amount). If Paymob gave you a USD integration, set `PAYMOB_CURRENCY=USD`.
   - Each payment tells Paymob to call back `BASE_URL/webhooks/paymob` and to send the client back to `BASE_URL/return/paymob`. If your dashboard also asks for callback URLs on the integration, enter the same two addresses.
   - Make one real payment with a small price before announcing the site.
4. **Payments: Stripe** (only if you have a Stripe account; Stripe doesn't onboard Egypt-registered companies directly).
   - `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`.
   - Add a webhook endpoint `BASE_URL/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, then put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. **Email.** Create a free Resend account, verify your domain, set `RESEND_API_KEY`, `MAIL_FROM` (an address on that domain) and `COACH_EMAIL` (where new-order alerts go).
6. **Terms page.** Fill the `[COMPANY LEGAL NAME]`, `[ADDRESS]`, `[SUPPORT EMAIL]`, `[SUPPORT NUMBER]` and `[DATE]` placeholders in `public/terms.html`. Payment providers check for this page. Have it reviewed by a lawyer.
7. **Exercise videos.** Record a short demo for each exercise (101 in total, listed in Admin → Exercise videos; each already has a public demo video you can replace), upload them to YouTube as unlisted, Vimeo, or any host with a direct .mp4 link, and paste each link there. Then tick "Sell the video add-on". Until you tick it, the $10 video add-on stays hidden on the site.
8. **Admin.** Log in at `/admin`, set prices, call hours and working days, check the food list. The yellow box at the top lists anything still missing.
9. **Back up** the database file (`DB_PATH`) regularly; it holds every order.

## How the main pieces fit

| File | What it does |
|---|---|
| `server.js` | Web server, all pages and API routes, webhooks, admin |
| `lib/engine.js` | Plan math: BMR/TDEE, macros, meal solver, training programs |
| `lib/cardio.js` | Cardio plan add-on (zones, weekly schedule, 4-week progression) |
| `lib/orders.js` | Checkout, call slots, marking orders paid, emails, monthly renewals |
| `lib/payments.js` | Paymob, Stripe and test-mode gateways |
| `lib/db.js` | Database tables, default prices and hours |
| `lib/mail.js` | Email sending through Resend, saved to the outbox |
| `public/` | Website, plan page, admin page, styles and browser scripts |
| `test/e2e.js` | Automatic end-to-end tests |

### The meal solver

The prototype set the protein food first, then the carb, then the fat, so protein from bread or ful and fat from salmon came on top of the targets. Plans ran about 9% over on calories and 27% over on protein for a typical client. The solver now balances the protein, carb and fat foods together. Across 4,000 simulated clients the typical error is about 3% on calories and 2% on protein.

### Privacy and security

- Plan links are long random tokens; pages are marked `noindex` and send no referrer.
- Prices, eligibility and call availability are all checked on the server; the browser can't change what is charged.
- Payment callbacks are verified (Paymob HMAC, Stripe signature) before an order is marked paid.
- Admin login is rate-limited and uses a signed, HttpOnly cookie.
- Card details never reach this server.
