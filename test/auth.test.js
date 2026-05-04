/**
 * Auth API Tests — signup, login, logout, session checks.
 * 11 test cases covering the full authentication lifecycle.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, request, createUser, getCsrf, authAgent, resetDb } = require('./helpers/setup');

test.beforeEach(() => resetDb());

// ---- SIGNUP ----

test('Signup with valid college email returns 201 and sets auth cookie', async () => {
    const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Arjun Patel', email: 'arjun@example.edu', password: 'securepass123' })
        .expect(201);

    assert.equal(res.body.user.name, 'Arjun Patel');
    assert.equal(res.body.user.email, 'arjun@example.edu');
    assert.ok(res.body.user.id);

    const cookies = res.headers['set-cookie'] || [];
    assert.ok(cookies.some(c => c.startsWith('token=')), 'Should set auth cookie');
});

test('Signup rejects non-allowed email domain with 403', async () => {
    const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Hacker', email: 'hacker@gmail.com', password: 'password123' })
        .expect(403);

    assert.match(res.body.error, /example\.edu/);
});

test('Signup rejects duplicate email with 409', async () => {
    await request(app)
        .post('/api/auth/signup')
        .send({ name: 'First User', email: 'duplicate@example.edu', password: 'password123' })
        .expect(201);

    const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Second User', email: 'duplicate@example.edu', password: 'password456' })
        .expect(409);

    assert.match(res.body.error, /already exists/i);
});

test('Signup rejects name shorter than minimum length', async () => {
    const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'A', email: 'short@example.edu', password: 'password123' })
        .expect(400);

    assert.match(res.body.error, /name/i);
});

test('Signup rejects password shorter than minimum', async () => {
    const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Valid Name', email: 'weakpass@example.edu', password: 'short' })
        .expect(400);

    assert.match(res.body.error, /password/i);
});

// ---- LOGIN ----

test('Login with correct credentials returns 200 and sets auth cookie', async () => {
    await createUser({ email: 'login@example.edu', password: 'mypassword99' });
    resetDb(); // Clear to test re-login... actually we need the user to exist
    // Re-create since resetDb clears everything
    await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Login User', email: 'login@example.edu', password: 'mypassword99' })
        .expect(201);

    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@example.edu', password: 'mypassword99' })
        .expect(200);

    assert.equal(res.body.user.email, 'login@example.edu');
    const cookies = res.headers['set-cookie'] || [];
    assert.ok(cookies.some(c => c.startsWith('token=')));
});

test('Login rejects wrong password with 401', async () => {
    await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Real User', email: 'real@example.edu', password: 'correctpass1' })
        .expect(201);

    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'real@example.edu', password: 'wrongpassword' })
        .expect(401);

    assert.match(res.body.error, /invalid/i);
});

test('Login rejects nonexistent user with 401', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.edu', password: 'password123' })
        .expect(401);

    assert.match(res.body.error, /invalid/i);
});

// ---- LOGOUT ----

test('Logout returns 200 and clears auth cookie', async () => {
    const { cookies } = await createUser();
    const authCookie = cookies.find(c => c.startsWith('token='));
    const { csrfCookie, csrfToken } = await getCsrf();

    const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [authCookie, csrfCookie].filter(Boolean).join('; '))
        .set('x-csrf-token', csrfToken)
        .type('json')
        .send({})
        .expect(200);

    assert.match(res.body.message, /logged out/i);
});

// ---- SESSION ----

test('/me returns user object when authenticated', async () => {
    const { authCookie, user } = await createUser({ name: 'Session User', email: 'session@example.edu' });

    const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

    assert.ok(res.body.user);
    assert.equal(res.body.user.email, 'session@example.edu');
});

test('/me returns null when not authenticated', async () => {
    const res = await request(app)
        .get('/api/auth/me')
        .expect(200);

    assert.equal(res.body.user, null);
});
