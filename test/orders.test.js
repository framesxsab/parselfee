/**
 * Orders API Tests — full order lifecycle like Swiggy's order flow.
 * 18 test cases: create, list, accept, status transitions, PIN validation.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, request, authAgent, resetDb } = require('./helpers/setup');

test.beforeEach(() => resetDb());

const VALID_ORDER = {
    item_desc: 'Biryani from Zomato at main gate',
    pickup_location: 'Gate',
    deliver_to: 'Room',
    room_details: 'Hostel B, Room 204',
    delivery_fee: 25,
    urgency: 'asap',
    notes: 'Call when at gate'
};

// ---- CREATE ORDER ----

test('Create order with valid data returns 201', async () => {
    const agent = await authAgent({ email: 'placer@example.edu' });

    const res = await agent.post('/api/orders')
        .send(VALID_ORDER)
        .expect(201);

    assert.ok(res.body.order.id);
    assert.ok(res.body.order.order_code);
    assert.equal(res.body.order.item_desc, VALID_ORDER.item_desc);
    assert.equal(res.body.order.delivery_fee, 25);
    assert.equal(res.body.order.status, 'open');
});

test('Create order rejects missing required fields', async () => {
    const agent = await authAgent({ email: 'placer2@example.edu' });

    const res = await agent.post('/api/orders')
        .send({ item_desc: '' })
        .expect(400);

    assert.ok(res.body.error);
});

test('Create order rejects invalid urgency value', async () => {
    const agent = await authAgent({ email: 'placer3@example.edu' });

    const res = await agent.post('/api/orders')
        .send({ ...VALID_ORDER, urgency: 'yesterday' })
        .expect(400);

    assert.match(res.body.error, /urgency/i);
});

test('Create order rejects fee below minimum', async () => {
    const agent = await authAgent({ email: 'placer4@example.edu' });

    const res = await agent.post('/api/orders')
        .send({ ...VALID_ORDER, delivery_fee: 1 })
        .expect(400);

    assert.match(res.body.error, /fee/i);
});

test('Create order rejects fee above maximum', async () => {
    const agent = await authAgent({ email: 'placer5@example.edu' });

    const res = await agent.post('/api/orders')
        .send({ ...VALID_ORDER, delivery_fee: 99999 })
        .expect(400);

    assert.match(res.body.error, /fee/i);
});

test('Create scheduled order rejects past time', async () => {
    const agent = await authAgent({ email: 'placer6@example.edu' });

    const res = await agent.post('/api/orders')
        .send({
            ...VALID_ORDER,
            urgency: 'scheduled',
            schedule_time: new Date(Date.now() - 3600000).toISOString()
        })
        .expect(400);

    assert.match(res.body.error, /schedule/i);
});

// ---- LIST ORDERS ----

test('List open orders returns 200 with array', async () => {
    const agent = await authAgent({ email: 'lister@example.edu' });

    // Create an order first
    await agent.post('/api/orders').send(VALID_ORDER).expect(201);

    const res = await agent.get('/api/orders?status=open')
        .expect(200);

    assert.ok(Array.isArray(res.body.orders));
});

test('Unauthenticated access to orders returns 401', async () => {
    const res = await request(app)
        .get('/api/orders')
        .expect(401);

    assert.match(res.body.error, /authentication/i);
});

// ---- MY ORDERS ----

test('Get placed orders returns user-specific orders', async () => {
    const agent = await authAgent({ email: 'myorders@example.edu' });
    await agent.post('/api/orders').send(VALID_ORDER).expect(201);

    const res = await agent.get('/api/orders/mine?type=placed')
        .expect(200);

    assert.ok(Array.isArray(res.body.orders));
    assert.ok(res.body.orders.length >= 1);
});

test('Get accepted orders returns 200', async () => {
    const agent = await authAgent({ email: 'accepted@example.edu' });

    const res = await agent.get('/api/orders/mine?type=accepted')
        .expect(200);

    assert.ok(Array.isArray(res.body.orders));
});

// ---- ACCEPT ORDER ----

test('Accept another user order returns 200', async () => {
    const placer = await authAgent({ email: 'placer7@example.edu' });
    const deliverer = await authAgent({ email: 'deliverer1@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    const res = await deliverer.patch(`/api/orders/${orderId}/accept`)
        .expect(200);

    assert.ok(res.body.order);
    assert.equal(res.body.order.status, 'accepted');
});

test('Cannot accept own order returns 400', async () => {
    const agent = await authAgent({ email: 'selfaccept@example.edu' });

    const orderRes = await agent.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    const res = await agent.patch(`/api/orders/${orderId}/accept`)
        .expect(400);

    assert.match(res.body.error, /own order/i);
});

test('Cannot accept already-accepted order', async () => {
    const placer = await authAgent({ email: 'placer8@example.edu' });
    const deliverer1 = await authAgent({ email: 'deliverer2@example.edu' });
    const deliverer2 = await authAgent({ email: 'deliverer3@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    await deliverer1.patch(`/api/orders/${orderId}/accept`).expect(200);

    const res = await deliverer2.patch(`/api/orders/${orderId}/accept`);
    assert.ok(res.status === 400 || res.status === 409);
});

// ---- STATUS TRANSITIONS ----

test('Accepter can mark order as picked up', async () => {
    const placer = await authAgent({ email: 'placer9@example.edu' });
    const deliverer = await authAgent({ email: 'deliverer4@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    await deliverer.patch(`/api/orders/${orderId}/accept`).expect(200);

    const res = await deliverer.patch(`/api/orders/${orderId}/status`)
        .send({ status: 'picked_up' })
        .expect(200);

    assert.equal(res.body.order.status, 'picked_up');
});

test('Deliver with correct PIN succeeds', async () => {
    const placer = await authAgent({ email: 'placer10@example.edu' });
    const deliverer = await authAgent({ email: 'deliverer5@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    await deliverer.patch(`/api/orders/${orderId}/accept`).expect(200);
    await deliverer.patch(`/api/orders/${orderId}/status`).send({ status: 'picked_up' }).expect(200);

    // Get the delivery PIN from the placer's view
    const detailRes = await placer.get(`/api/orders/${orderId}`).expect(200);
    const pin = detailRes.body.order.delivery_pin;
    assert.ok(pin, 'Order should have a delivery PIN');

    const res = await deliverer.patch(`/api/orders/${orderId}/status`)
        .send({ status: 'delivered', delivery_pin: pin })
        .expect(200);

    assert.equal(res.body.order.status, 'delivered');
});

test('Deliver with wrong PIN is rejected', async () => {
    const placer = await authAgent({ email: 'placer11@example.edu' });
    const deliverer = await authAgent({ email: 'deliverer6@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    await deliverer.patch(`/api/orders/${orderId}/accept`).expect(200);
    await deliverer.patch(`/api/orders/${orderId}/status`).send({ status: 'picked_up' }).expect(200);

    const res = await deliverer.patch(`/api/orders/${orderId}/status`)
        .send({ status: 'delivered', delivery_pin: '000000' })
        .expect(400);

    assert.match(res.body.error, /pin/i);
});

test('Placer can cancel open order', async () => {
    const placer = await authAgent({ email: 'placer12@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    const res = await placer.patch(`/api/orders/${orderId}/status`)
        .send({ status: 'cancelled' })
        .expect(200);

    assert.equal(res.body.order.status, 'cancelled');
});

test('Invalid state transition is rejected', async () => {
    const placer = await authAgent({ email: 'placer13@example.edu' });

    const orderRes = await placer.post('/api/orders').send(VALID_ORDER).expect(201);
    const orderId = orderRes.body.order.id;

    // Trying to go from open -> delivered (skipping accept + picked_up)
    const res = await placer.patch(`/api/orders/${orderId}/status`)
        .send({ status: 'delivered' })
        .expect(403);

    assert.match(res.body.error, /not allowed/i);
});
