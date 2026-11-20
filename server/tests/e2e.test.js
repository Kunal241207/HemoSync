import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { runExpiryMonitoringJob } from '../src/services/expiryService.js';

describe('Module 13: End-to-End Clinical Logistics Integration Scenarios', () => {
  let adminToken;
  let metroHospToken;
  let stJudeHospToken;
  let centralBbToken;
  let lifeStreamBbToken;
  let metroHospital;
  let stJudeHospital;
  let centralBloodBank;
  let lifeStreamBloodBank;
  let metroUser;

  const cleanupUnitIds = [];
  const cleanupRequestIds = [];
  const cleanupTransferIds = [];

  beforeAll(async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@hemosync.org', password: 'Password123!' });
    adminToken = adminLogin.body.data.token;

    const metroLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@metrogeneral.org', password: 'Password123!' });
    metroHospToken = metroLogin.body.data.token;

    const stJudeLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@stjudepavilion.org', password: 'Password123!' });
    stJudeHospToken = stJudeLogin.body.data.token;

    const bbLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@centralblood.org', password: 'Password123!' });
    centralBbToken = bbLogin.body.data.token;

    const lsLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logistics@lifestreamblood.org', password: 'Password123!' });
    lifeStreamBbToken = lsLogin.body.data.token;

    metroHospital = await prisma.institution.findFirst({ where: { licenseNumber: 'HOSP-MA-2024-001' } });
    stJudeHospital = await prisma.institution.findFirst({ where: { licenseNumber: 'HOSP-MA-2024-002' } });
    centralBloodBank = await prisma.institution.findFirst({ where: { licenseNumber: 'BB-MA-2024-101' } });
    lifeStreamBloodBank = await prisma.institution.findFirst({ where: { licenseNumber: 'BB-MA-2024-102' } });
    metroUser = await prisma.user.findFirst({ where: { email: 'staff@metrogeneral.org' } });
  });

  afterAll(async () => {
    if (cleanupTransferIds.length > 0) {
      await prisma.transferUnit.deleteMany({ where: { transferId: { in: cleanupTransferIds } } });
      await prisma.transfer.deleteMany({ where: { id: { in: cleanupTransferIds } } });
    }
    if (cleanupRequestIds.length > 0) {
      await prisma.allocation.deleteMany({ where: { requestId: { in: cleanupRequestIds } } });
      await prisma.bloodRequest.deleteMany({ where: { id: { in: cleanupRequestIds } } });
    }
    if (cleanupUnitIds.length > 0) {
      await prisma.expiryAlert.deleteMany({ where: { bloodUnitId: { in: cleanupUnitIds } } });
      await prisma.inventoryEvent.deleteMany({ where: { bloodUnitId: { in: cleanupUnitIds } } });
      await prisma.bloodUnit.deleteMany({ where: { id: { in: cleanupUnitIds } } });
    }
  });

  describe('Test Scenario A — Local Stock Available', () => {
    it('1-7: Complete lifecycle: register -> request -> match -> allocate -> reserve -> status -> audit/notifications', async () => {
      const unitCode = `W0365-E2EA-${Date.now()}`;
      const localUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: metroHospital.id,
          unitCode,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'O',
          rhFactor: 'NEGATIVE',
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 25 * 86400000), // 25 days remaining
          volumeMl: 450,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED'
        }
      });
      cleanupUnitIds.push(localUnit.id);

      const reqRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'RED_BLOOD_CELLS',
          requestedABO: 'O',
          requestedRh: 'NEGATIVE',
          requestedQuantity: 1,
          urgency: 'URGENT',
          requiredBy: new Date(Date.now() + 12 * 3600000).toISOString(),
          reason: 'Scenario A: Surgical Trauma Case'
        });

      expect(reqRes.status).toBe(201);
      const createdRequest = reqRes.body.data;
      cleanupRequestIds.push(createdRequest.id);

      const matchRes = await request(app)
        .get(`/api/requests/${createdRequest.id}/matches`)
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(matchRes.status).toBe(200);
      expect(matchRes.body.data.candidateUnits.length).toBeGreaterThanOrEqual(1);
      const matchedUnit = matchRes.body.data.candidateUnits.find((u) => u.id === localUnit.id);
      expect(matchedUnit).toBeDefined();

      const allocRes = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          unitIds: [localUnit.id]
        });

      expect(allocRes.status).toBe(201);
      expect(allocRes.body.success).toBe(true);

      const updatedUnit = await prisma.bloodUnit.findUnique({ where: { id: localUnit.id } });
      expect(updatedUnit.inventoryStatus).toBe('RESERVED');

      const updatedReq = await prisma.bloodRequest.findUnique({ where: { id: createdRequest.id } });
      expect(updatedReq.status).toBe('ALLOCATED');

      const event = await prisma.inventoryEvent.findFirst({
        where: { bloodUnitId: localUnit.id, newStatus: 'RESERVED' }
      });
      expect(event).not.toBeNull();

      const auditLog = await prisma.auditLog.findFirst({
        where: { entityType: 'BLOOD_REQUEST', entityId: createdRequest.id, action: 'ALLOCATE' }
      });
      expect(auditLog).not.toBeNull();

      const notification = await prisma.notification.findFirst({
        where: { institutionId: metroHospital.id, type: 'ALLOCATION_APPROVED' }
      });
      expect(notification).not.toBeNull();
    });
  });

  describe('Test Scenario B — Insufficient Local Stock & Inter-Institution Transfer', () => {
    it('1-9: Complete transfer lifecycle: shortage -> local partial -> nearby search -> request -> approve -> reserve -> dispatch -> receive -> ownership', async () => {
      const sourceUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: `W0365-TRANSFER-${Date.now()}`,
          componentType: 'PLATELETS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 48 * 3600000), // 48h shelf life
          volumeMl: 300,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED'
        }
      });
      cleanupUnitIds.push(sourceUnit.id);

      const reqRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'PLATELETS',
          requestedABO: 'A',
          requestedRh: 'POSITIVE',
          requestedQuantity: 5, // High quantity exceeds local stock
          urgency: 'EMERGENCY',
          requiredBy: new Date(Date.now() + 6 * 3600000).toISOString()
        });
      const bloodReq = reqRes.body.data;
      cleanupRequestIds.push(bloodReq.id);

      const localMatch = await request(app)
        .get(`/api/requests/${bloodReq.id}/matches`)
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(localMatch.status).toBe(200);
      expect(localMatch.body.data.shortage).toBeGreaterThan(0);
      expect(localMatch.body.data.isSufficient).toBe(false);

      const nearbyRes = await request(app)
        .get(`/api/requests/${bloodReq.id}/nearby-matches?maxDistanceKm=100`)
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(nearbyRes.status).toBe(200);
      expect(nearbyRes.body.data.nearbyInstitutions.length).toBeGreaterThanOrEqual(1);

      const transferRes = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          sourceInstitutionId: centralBloodBank.id,
          destinationInstitutionId: metroHospital.id,
          requestId: bloodReq.id,
          unitIds: [sourceUnit.id],
          notes: 'Emergency transfer for patient undergoing cardiovascular surgery'
        });

      expect(transferRes.status).toBe(201);
      const transfer = transferRes.body.data;
      cleanupTransferIds.push(transfer.id);
      expect(transfer.status).toBe('REQUESTED');

      const approveRes = await request(app)
        .patch(`/api/transfers/${transfer.id}/approve`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({ notes: 'Cross-match confirmed. Transfer authorized.' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      const reservedUnit = await prisma.bloodUnit.findUnique({ where: { id: sourceUnit.id } });
      expect(reservedUnit.inventoryStatus).toBe('RESERVED');

      const dispatchRes = await request(app)
        .patch(`/api/transfers/${transfer.id}/dispatch`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({ courier: 'BioCourier Global', trackingNumber: 'TRK-9872', notes: 'Courier dispatched via cold-chain validated carrier' });

      expect(dispatchRes.status).toBe(200);
      expect(dispatchRes.body.data.status).toBe('DISPATCHED');

      const receiveRes = await request(app)
        .patch(`/api/transfers/${transfer.id}/receive`)
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({ packagingIntact: true, conditionNotes: 'Delivered at 22C in active agitating thermal cooler' });

      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.data.status).toBe('RECEIVED');

      const transferredUnit = await prisma.bloodUnit.findUnique({ where: { id: sourceUnit.id } });
      expect(transferredUnit.institutionId).toBe(metroHospital.id);
      expect(['RESERVED', 'AVAILABLE']).toContain(transferredUnit.inventoryStatus);

      const requestAfterTransfer = await prisma.bloodRequest.findUnique({ where: { id: bloodReq.id } });
      expect(['PARTIALLY_ALLOCATED', 'ALLOCATED', 'TRANSFER_PENDING']).toContain(requestAfterTransfer.status);
    });
  });

  describe('Test Scenario C — Expiry Monitoring & Allocation Blocking', () => {
    it('1-5: Approaches expiry -> scheduled monitoring alert -> staff sees alert -> ineligible -> allocation blocked', async () => {
      const expiredUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: `W0365-EXPC-${Date.now()}`,
          componentType: 'PLATELETS',
          aboGroup: 'O',
          rhFactor: 'POSITIVE',
          collectionDate: new Date(Date.now() - 7 * 86400000),
          expiryDate: new Date(Date.now() - 3600000), // Expired 1 hour ago
          volumeMl: 300,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED'
        }
      });
      cleanupUnitIds.push(expiredUnit.id);

      const jobResult = await runExpiryMonitoringJob({ referenceDate: new Date() });
      expect(jobResult.expiredUnitsMarked).toBeGreaterThanOrEqual(1);

      const alertsRes = await request(app)
        .get('/api/expiry/alerts')
        .set('Authorization', `Bearer ${centralBbToken}`);

      expect(alertsRes.status).toBe(200);
      expect(alertsRes.body.data.alerts.length).toBeGreaterThan(0);

      const updatedUnit = await prisma.bloodUnit.findUnique({ where: { id: expiredUnit.id } });
      expect(updatedUnit.inventoryStatus).toBe('EXPIRED');
      expect(updatedUnit.releaseStatus).toBe('REJECTED');

      const reqRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'PLATELETS',
          requestedABO: 'O',
          requestedRh: 'POSITIVE',
          requestedQuantity: 1,
          urgency: 'ROUTINE',
          requiredBy: new Date(Date.now() + 24 * 3600000).toISOString()
        });
      cleanupRequestIds.push(reqRes.body.data.id);

      const failedAlloc = await request(app)
        .post(`/api/requests/${reqRes.body.data.id}/allocations`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({ unitIds: [expiredUnit.id] });

      expect([400, 409]).toContain(failedAlloc.status);
    });
  });

  describe('Test Scenario D — Demand Forecasting & Shortage Detection', () => {
    it('1-4: Seed historical requests -> generate forecast -> compare with inventory -> display shortage warnings', async () => {
      const histRes = await request(app)
        .get('/api/forecasts/history?lookbackDays=30')
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(histRes.status).toBe(200);
      expect(Array.isArray(histRes.body.data.history)).toBe(true);

      const genRes = await request(app)
        .post('/api/forecasts/generate')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({ horizonDays: 7 });

      expect(genRes.status).toBe(200);
      expect(Array.isArray(genRes.body.data)).toBe(true);

      const shortageRes = await request(app)
        .get('/api/intelligence/shortages?days=7')
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(shortageRes.status).toBe(200);
      expect(shortageRes.body.data.projections.length).toBe(3);

      for (const proj of shortageRes.body.data.projections) {
        expect(['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA']).toContain(proj.riskStatus);
        expect(typeof proj.netProjectedBalance).toBe('number');
        expect(proj).toHaveProperty('projectedDemand');
        expect(proj).toHaveProperty('usableOnHand');
      }
    });
  });

  describe('Test Scenario E — Security & Concurrency Boundaries', () => {
    it('1. Unauthenticated access fails (401)', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
    });

    it('2. Hospital staff cannot modify another institution\'s stock (403)', async () => {
      const stJudeUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: stJudeHospital.id,
          unitCode: `W0365-SEC-${Date.now()}`,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'B',
          rhFactor: 'POSITIVE',
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 20 * 86400000),
          volumeMl: 450,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED'
        }
      });
      cleanupUnitIds.push(stJudeUnit.id);

      const res = await request(app)
        .patch(`/api/inventory/${stJudeUnit.id}/status`)
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({ newStatus: 'QUARANTINED', notes: 'Unauthorized breach attempt' });

      expect(res.status).toBe(403);
    });

    it('3. Blood bank staff cannot approve unauthorized transfers belonging to another bank (403)', async () => {
      const transfer = await prisma.transfer.create({
        data: {
          sourceInstitutionId: centralBloodBank.id,
          destinationInstitutionId: metroHospital.id,
          status: 'REQUESTED',
          notes: 'Test transfer for authorization check'
        }
      });
      cleanupTransferIds.push(transfer.id);

      const unauthorizedApprove = await request(app)
        .patch(`/api/transfers/${transfer.id}/approve`)
        .set('Authorization', `Bearer ${lifeStreamBbToken}`)
        .send({ notes: 'Intruder approval' });

      expect(unauthorizedApprove.status).toBe(403);
    });

    it('4. Concurrent allocations cannot reserve the same unit twice (atomic lock)', async () => {
      const sharedUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: metroHospital.id,
          unitCode: `W0365-CONCURR-${Date.now()}`,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'O',
          rhFactor: 'POSITIVE',
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 15 * 86400000),
          volumeMl: 450,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED'
        }
      });
      cleanupUnitIds.push(sharedUnit.id);

      const req1 = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'RED_BLOOD_CELLS',
          requestedABO: 'O',
          requestedRh: 'POSITIVE',
          requestedQuantity: 1,
          urgency: 'EMERGENCY',
          requiredBy: new Date(Date.now() + 6 * 3600000).toISOString()
        });
      cleanupRequestIds.push(req1.body.data.id);

      const req2 = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'RED_BLOOD_CELLS',
          requestedABO: 'O',
          requestedRh: 'POSITIVE',
          requestedQuantity: 1,
          urgency: 'URGENT',
          requiredBy: new Date(Date.now() + 12 * 3600000).toISOString()
        });
      cleanupRequestIds.push(req2.body.data.id);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/requests/${req1.body.data.id}/allocations`)
          .set('Authorization', `Bearer ${metroHospToken}`)
          .send({ unitIds: [sharedUnit.id] }),
        request(app)
          .post(`/api/requests/${req2.body.data.id}/allocations`)
          .set('Authorization', `Bearer ${metroHospToken}`)
          .send({ unitIds: [sharedUnit.id] })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses.some((s) => s === 400 || s === 409)).toBe(true);

      const allocations = await prisma.allocation.findMany({
        where: { bloodUnitId: sharedUnit.id, status: 'RESERVED' }
      });
      expect(allocations.length).toBe(1);
    });
  });
});
