import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { _resetRateLimiter } from '../src/middleware/rateLimiter.js';


describe('Module 3: Authentication and Role-Based Access Control (RBAC)', () => {
  beforeEach(() => {
    _resetRateLimiter();
  });

  describe('POST /api/auth/login', () => {
    it('should reject malformed payloads with 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Validation failed');
    });

    it('should reject invalid credentials with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@hemosync.org', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');
    });

    it('should authenticate PLATFORM_ADMIN successfully and set HttpOnly cookies', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@hemosync.org', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('PLATFORM_ADMIN');
      expect(res.body.data.user.email).toBe('admin@hemosync.org');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find(c => c.startsWith('hemosync_token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('should authenticate HOSPITAL_STAFF with correct institution association', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@metrogeneral.org', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('HOSPITAL_STAFF');
      expect(res.body.data.user.institution).toBeDefined();
      expect(res.body.data.user.institution.type).toBe('HOSPITAL');
      expect(res.body.data.user.institution.name).toBe('Metro General Hospital');
    });

    it('should trigger rate limiting (429) after repeated failed login attempts', async () => {
      const badCredentials = { email: 'brute.force@hospital.org', password: 'badpassword' };

      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/login').send(badCredentials);
      }

      const blockedRes = await request(app).post('/api/auth/login').send(badCredentials);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.message).toContain('Too many failed login attempts');
      expect(blockedRes.headers).toHaveProperty('retry-after');
    });
  });

  describe('POST /api/auth/register', () => {
    it('does not allow public registration to assign privileged roles', async () => {
      const email = `attacker-${Date.now()}.hemo@dev.com`;

      try {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            name: 'Test User',
            email,
            password: 'Password123!',
            role: 'PLATFORM_ADMIN'
          });

        expect(res.status).toBe(201);
        expect(res.body.data.user.role).toBe('HOSPITAL_STAFF');
        expect(res.body.data.user.institutionId).toBeTruthy();
      } finally {
        await prisma.user.deleteMany({ where: { email } });
      }
    });
  });

  describe('GET /api/auth/me & POST /api/auth/logout', () => {
    it('should return 401 when accessing /api/auth/me unauthenticated', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return user session when authenticated via Bearer token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@centralblood.org', password: 'Password123!' });

      const token = loginRes.body.data.token;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.email).toBe('manager@centralblood.org');
      expect(meRes.body.data.role).toBe('BLOOD_BANK_STAFF');
      expect(meRes.body.data.institution.type).toBe('BLOOD_BANK');
    });

    it('should clear cookies on logout', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@hemosync.org', password: 'Password123!' });

      const token = loginRes.body.data.token;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toContain('Signed out successfully');

      const cookies = logoutRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find(c => c.startsWith('hemosync_token=;'));
      expect(tokenCookie).toBeDefined();
    });
  });

  describe('Role-Based Access Control (RBAC) & Admin User APIs', () => {
    let adminToken;
    let hospitalToken;
    let bloodBankToken;
    let metroHospital;

    beforeEach(async () => {
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@hemosync.org', password: 'Password123!' });
      adminToken = adminLogin.body.data.token;

      const hospitalLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@metrogeneral.org', password: 'Password123!' });
      hospitalToken = hospitalLogin.body.data.token;

      const bbLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@centralblood.org', password: 'Password123!' });
      bloodBankToken = bbLogin.body.data.token;

      metroHospital = await prisma.institution.findFirst({ where: { type: 'HOSPITAL' } });
    });

    it('should deny non-admin roles access to GET /api/admin/users with 403 Forbidden', async () => {
      const hospRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(hospRes.status).toBe(403);
      expect(hospRes.body.message).toContain('Access denied');

      const bbRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${bloodBankToken}`);
      expect(bbRes.status).toBe(403);
      expect(bbRes.body.message).toContain('Access denied');
    });

    it('should allow PLATFORM_ADMIN to list all users via GET /api/admin/users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      for (const u of res.body.data) {
        expect(u).not.toHaveProperty('passwordHash');
      }
    });

    it('should deny non-admin roles from creating users via POST /api/admin/users', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          name: 'Unauthorized User',
          email: 'unauth@hospital.org',
          password: 'Password123!',
          role: 'HOSPITAL_STAFF',
          institutionId: metroHospital.id
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should allow PLATFORM_ADMIN to create an institution staff account with bcrypt hashing', async () => {
      const uniqueEmail = `dr.patel.${Date.now()}@metrogeneral.org`;

      const createRes = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Anita Patel',
          email: uniqueEmail,
          password: 'StrongHospitalPassword1!',
          role: 'HOSPITAL_STAFF',
          institutionId: metroHospital.id
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.email).toBe(uniqueEmail);
      expect(createRes.body.data.role).toBe('HOSPITAL_STAFF');
      expect(createRes.body.data.institutionId).toBe(metroHospital.id);

      const loginNewUser = await request(app)
        .post('/api/auth/login')
        .send({
          email: uniqueEmail,
          password: 'StrongHospitalPassword1!'
        });
      expect(loginNewUser.status).toBe(200);
      expect(loginNewUser.body.data.user.name).toBe('Dr. Anita Patel');

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'USER',
          entityId: createRes.body.data.id,
          action: 'CREATE'
        }
      });
      expect(audit).not.toBeNull();
      expect(audit.actorId).toBeDefined();

      await prisma.auditLog.deleteMany({ where: { entityId: createRes.body.data.id } });
      await prisma.user.delete({ where: { id: createRes.body.data.id } });
    });

    it('should reject creating staff account without an institutionId', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Staff Without Institution',
          email: `noinst.${Date.now()}@hospital.org`,
          password: 'Password123!',
          role: 'HOSPITAL_STAFF'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });
  });
});
