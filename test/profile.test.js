/**
 * Profile API Tests — get, update, stats.
 * 6 test cases covering profile read/write and aggregate stats.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, request, authAgent, resetDb } = require('./helpers/setup');

test.beforeEach(() => resetDb());

test('Get own profile returns 200 with user data', async () => {
    const agent = await authAgent({ name: 'Profile User', email: 'profile@example.edu' });

    const res = await agent.get('/api/profile')
        .expect(200);

    assert.ok(res.body.user);
    assert.equal(res.body.user.email, 'profile@example.edu');
    assert.equal(res.body.user.name, 'Profile User');
});

test('Update name successfully returns 200', async () => {
    const agent = await authAgent({ email: 'rename@example.edu' });

    const res = await agent.patch('/api/profile')
        .send({ name: 'Updated Name' })
        .expect(200);

    assert.equal(res.body.user.name, 'Updated Name');
});

test('Update phone with valid format returns 200', async () => {
    const agent = await authAgent({ email: 'phone@example.edu' });

    const res = await agent.patch('/api/profile')
        .send({ phone: '+91 98765 43210' })
        .expect(200);

    assert.equal(res.body.user.phone, '+91 98765 43210');
});

test('Update phone with invalid format returns 400', async () => {
    const agent = await authAgent({ email: 'badphone@example.edu' });

    const res = await agent.patch('/api/profile')
        .send({ phone: 'not-a-phone' })
        .expect(400);

    assert.match(res.body.error, /phone/i);
});

test('Empty update with no fields returns 400', async () => {
    const agent = await authAgent({ email: 'empty@example.edu' });

    const res = await agent.patch('/api/profile')
        .send({})
        .expect(400);

    assert.match(res.body.error, /no fields/i);
});

test('Get aggregate stats returns 200', async () => {
    const agent = await authAgent({ email: 'stats@example.edu' });

    const res = await agent.get('/api/profile/stats')
        .expect(200);

    assert.ok(res.body.stats);
    assert.ok('total_orders' in res.body.stats);
    assert.ok('total_delivered' in res.body.stats);
    assert.ok('total_earned' in res.body.stats);
});
