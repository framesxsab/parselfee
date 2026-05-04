# Deploy Parselfee To Railway

This app runs as a Node.js server with PostgreSQL.

## 1. Push Repository

Push this project to GitHub (or GitLab/Bitbucket).

## 2. Create Railway Project

1. Open Railway dashboard.
2. Click New Project.
3. Select Deploy from GitHub Repo.
4. Choose this repository.

Railway will detect Node.js and run `npm start`.

## 3. Provision PostgreSQL In Railway

1. In your project, click New Service.
2. Select Database -> PostgreSQL.
3. Wait until the DB service is ready.

Railway exposes a connection variable from the Postgres service.

## 4. Add Environment Variables

Set every variable listed in `.env.example` in Railway service variables.

At minimum, make sure these are production-specific:

- `JWT_SECRET` = long random string
- `NODE_ENV` = `production`
- `ALLOWED_ORIGIN` = your public app URL (Railway domain or custom domain)
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference from Railway variable picker)
- `ALLOWED_EMAIL_DOMAINS`, pickup/delivery locations, fee limits, rate limits, cookie settings, CSP sources, and map settings should match the deployed product.

Generate JWT secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Deploy

Trigger a deploy (or redeploy latest commit).

## 6. Verify

After deploy is live, check:

- `https://<your-domain>/api/health` returns JSON with `status: "ok"`
- App homepage loads
- Signup/login/order flows work

## Notes

- `railway.json` is included to define start command and health check path.
- Tables and indexes are initialized automatically on startup.
- If you are migrating existing SQLite data, import it into Railway Postgres before production cutover.
