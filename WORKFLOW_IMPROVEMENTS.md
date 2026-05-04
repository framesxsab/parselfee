# Parselfee Workflow Improvement Plan

## Current Improvements

- Browse deliveries now supports text search across item, pickup, delivery, and room details.
- Browse deliveries can be filtered by urgency and sorted by newest, highest fee, lowest fee, or urgency.
- Scheduled orders now require a valid future time at least 5 minutes ahead.
- `npm run verify` gives the project a repeatable syntax check before deployment.
- `npm run verify` now also runs `npm audit --audit-level=moderate`.
- Cookie-authenticated API mutations are protected with a signed CSRF token.
- Delivery status updates run inside transactions to prevent duplicate delivery credit.
- Production settings are centralized in `config.js` and loaded from environment variables.
- Frontend domains, pickup locations, delivery locations, fee ranges, map settings, and CSRF names now come from `/api/config`.
- Security middleware and public runtime config now have automated tests.
- GitHub Actions runs `npm ci` and `npm run verify` on pushes and pull requests.

## Next Product Improvements

1. Add order lifecycle notifications for accepted, picked up, delivered, and cancelled states.
2. Add ratings after delivery so reliable deliverers are easier to identify.
3. Add a cancellation reason and basic dispute trail for failed handoffs.
4. Add saved hostel/room defaults when placing an order to reduce repeated typing.
5. Add a public pickup heatmap or quick filters for the most active locations.

## Next Engineering Improvements

1. Add database-backed API tests for signup, login, order creation, acceptance, status changes, and delivery PIN validation.
2. Replace inline browser event handlers with centralized event listeners as the frontend grows.
3. Add database migrations instead of relying only on startup schema creation.
4. Add structured request logging with request ids for easier production debugging.
5. Add a migration runner that can apply ordered SQL migration files before startup.

## Security Hardening Checklist

1. Keep `npm audit --audit-level=moderate` clean before deploy.
2. Use a unique production `JWT_SECRET` with at least 32 characters.
3. Set `NODE_ENV=production` so secure cookies and production DB SSL are enabled.
4. Set `ALLOWED_ORIGIN` when using a separate frontend origin.
5. Keep every variable in `.env.example` explicitly configured in production.
6. Keep CSP script/style directives free of `'unsafe-inline'`.
7. Add API integration tests for CSRF rejection, authorization boundaries, and duplicate status submissions.

## Deployment Checklist

1. Run `npm run verify`.
2. Confirm `.env` has `JWT_SECRET` and `DATABASE_URL`.
3. Start locally with `npm run dev`.
4. Check `/api/health`.
5. Test login, place order, accept order, and delivery PIN flow before deploying.
