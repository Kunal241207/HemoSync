import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('Module 7: Inventory Matching and Allocation Engine', () => {
  let adminToken;
  let metroHospToken;
  let stJudeHospToken;
  let centralBbToken;
  let metroHospital;
  let centralBloodBank;
  let createdRequest;
  const createdUnitIds = [];

  beforeEach(async () => {
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

    metroHospital = await prisma.institution.findFirst({ where: { licenseNumber: 'HOSP-MA-2024-001' } });
    centralBloodBank = await prisma.institution.findFirst({ where: { licenseNumber: 'BB-MA-2024-101' } });

    const reqRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${metroHospToken}`)
      .send({
        requestedComponent: 'RED_BLOOD_CELLS',
        requestedABO: 'A',
        requestedRh: 'POSITIVE',
        requestedQuantity: 3,
        urgency: 'URGENT',
        requiredBy: new Date(Date.now() + 12 * 3600000).toISOString(),
        reason: 'Matching Engine Test Request'
      });
    createdRequest = reqRes.body.data;
  });

  afterAll(async () => {
    if (createdRequest?.id) {
      await prisma.allocation.deleteMany({ where: { requestId: createdRequest.id } });
      await prisma.bloodRequest.deleteMany({ where: { id: createdRequest.id } });
    }
    if (createdUnitIds.length > 0) {
      await prisma.inventoryEvent.deleteMany({ where: { bloodUnitId: { in: createdUnitIds } } });
      await prisma.allocation.deleteMany({ where: { bloodUnitId: { in: createdUnitIds } } });
      await prisma.bloodUnit.deleteMany({ where: { id: { in: createdUnitIds } } });
    }
  });

  describe('Deterministic Inventory Matching (GET /api/requests/:id/matches)', () => {
    it('should retrieve eligible units ordered by FEFO (earliest expiry first)', async () => {
      const res = await request(app)
        .get(`/api/requests/${createdRequest.id}/matches?institutionId=${centralBloodBank.id}`)
        .set('Authorization', `Bearer ${centralBbToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rulesVersion).toBe('v1.0-clinical-standard');
      expect(res.body.data.manualReviewRequired).toBe(false);

      const candidates = res.body.data.candidateUnits;
      expect(Array.isArray(candidates)).toBe(true);

      for (let i = 0; i < candidates.length - 1; i++) {
        const curr = new Date(candidates[i].expiryDate).getTime();
        const next = new Date(candidates[i + 1].expiryDate).getTime();
        expect(curr).toBeLessThanOrEqual(next);
      }
    });

    it('should correctly calculate shortage when stock is insufficient', async () => {
      const rareReqRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'RED_BLOOD_CELLS',
          requestedABO: 'AB',
          requestedRh: 'NEGATIVE',
          requestedQuantity: 20,
          urgency: 'EMERGENCY',
          requiredBy: new Date(Date.now() + 4 * 3600000).toISOString(),
          reason: 'Severe shortage test'
        });

      const rareReqId = rareReqRes.body.data.id;

      const res = await request(app)
        .get(`/api/requests/${rareReqId}/matches?institutionId=${metroHospital.id}`)
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isSufficient).toBe(false);
      expect(res.body.data.shortage).toBeGreaterThan(0);
      expect(res.body.data.remainingQuantity).toBe(20);

      await prisma.bloodRequest.delete({ where: { id: rareReqId } });
    });

    it('should filter out ineligible stock (quarantined, unreleased, expired, or reserved units)', async () => {
      const quarantinedCode = `M7-Q-${Date.now().toString().slice(-6)}`;
      const qUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: metroHospital.id,
          unitCode: quarantinedCode,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          volumeMl: 450,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 86400000),
          testingStatus: 'PENDING',
          releaseStatus: 'QUARANTINED',
          inventoryStatus: 'QUARANTINED'
        }
      });
      createdUnitIds.push(qUnit.id);

      const res = await request(app)
        .get(`/api/requests/${createdRequest.id}/matches?institutionId=${metroHospital.id}`)
        .set('Authorization', `Bearer ${metroHospToken}`);

      expect(res.status).toBe(200);
      const foundQuarantined = res.body.data.candidateUnits.find((u) => u.unitCode === quarantinedCode);
      expect(foundQuarantined).toBeUndefined();
    });

    it('should apply plasma compatibility rules instead of red-cell rules for plasma requests', async () => {
      // Note: O is universal plasma recipient (can receive AB, A, B, O plasma)
      const plasmaReqRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'PLASMA',
          requestedABO: 'O',
          requestedRh: 'NEGATIVE',
          requestedQuantity: 2,
          urgency: 'ROUTINE',
          requiredBy: new Date(Date.now() + 24 * 3600000).toISOString(),
          reason: 'Plasma matching verification'
        });
      const plasmaReq = plasmaReqRes.body.data;

      const abPlasmaCode = `M7-FFP-${Date.now().toString().slice(-6)}`;
      const abPlasmaUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: abPlasmaCode,
          componentType: 'PLASMA',
          aboGroup: 'AB',
          rhFactor: 'POSITIVE',
          volumeMl: 300,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 180 * 86400000),
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(abPlasmaUnit.id);

      const res = await request(app)
        .get(`/api/requests/${plasmaReq.id}/matches?institutionId=${centralBloodBank.id}`)
        .set('Authorization', `Bearer ${centralBbToken}`);

      expect(res.status).toBe(200);
      const matchedUnit = res.body.data.candidateUnits.find((u) => u.unitCode === abPlasmaCode);
      expect(matchedUnit).toBeDefined();

      await prisma.bloodRequest.delete({ where: { id: plasmaReq.id } });
    });
  });

  describe('Transactional Allocation Engine (POST /api/requests/:id/allocations)', () => {
    let testUnit1;
    let testUnit2;

    beforeEach(async () => {
      const code1 = `M7-AL1-${Date.now().toString().slice(-6)}`;
      const code2 = `M7-AL2-${Date.now().toString().slice(-6)}`;

      testUnit1 = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: code1,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          volumeMl: 460,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 25 * 86400000),
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(testUnit1.id);

      testUnit2 = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: code2,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          volumeMl: 470,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 35 * 86400000),
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(testUnit2.id);
    });

    it('should successfully perform a partial allocation and update request status to PARTIALLY_ALLOCATED', async () => {
      const res = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({
          unitIds: [testUnit1.id],
          notes: 'Emergency partial allocation unit 1'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newStatus).toBe('PARTIALLY_ALLOCATED');
      expect(res.body.data.request.fulfilledQuantity).toBe(1);
      expect(res.body.data.request.remainingQuantity).toBe(2);

      const updatedUnit = await prisma.bloodUnit.findUnique({ where: { id: testUnit1.id } });
      expect(updatedUnit.inventoryStatus).toBe('RESERVED');

      const event = await prisma.inventoryEvent.findFirst({
        where: { bloodUnitId: testUnit1.id, eventType: 'ALLOCATION_RESERVED' }
      });
      expect(event).toBeDefined();
      expect(event.previousStatus).toBe('AVAILABLE');
      expect(event.newStatus).toBe('RESERVED');
    });

    it('should reject allocation of an incompatible blood unit (400)', async () => {
      const incompatibleCode = `M7-BAD-${Date.now().toString().slice(-6)}`;
      const badUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: incompatibleCode,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'B',
          rhFactor: 'POSITIVE',
          volumeMl: 450,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 86400000),
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(badUnit.id);

      const res = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({
          unitIds: [badUnit.id]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Clinical compatibility violation');
    });

    it('should reject allocation of an expired unit (400)', async () => {
      const expiredCode = `M7-EXP-${Date.now().toString().slice(-6)}`;
      const expUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: expiredCode,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          volumeMl: 450,
          collectionDate: new Date(Date.now() - 50 * 86400000),
          expiryDate: new Date(Date.now() - 1000), // Expired 1 second ago
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(expUnit.id);

      const res = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({
          unitIds: [expUnit.id]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expired');
    });

    it('should prevent over-fulfillment when attempting to allocate more than remaining quantity (400)', async () => {
      const extraCode = `M7-EXT-${Date.now().toString().slice(-6)}`;
      const extraUnit = await prisma.bloodUnit.create({
        data: {
          institutionId: centralBloodBank.id,
          unitCode: extraCode,
          componentType: 'RED_BLOOD_CELLS',
          aboGroup: 'A',
          rhFactor: 'POSITIVE',
          volumeMl: 450,
          collectionDate: new Date(),
          expiryDate: new Date(Date.now() + 20 * 86400000),
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          inventoryStatus: 'AVAILABLE'
        }
      });
      createdUnitIds.push(extraUnit.id);

      const res = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${centralBbToken}`)
        .send({
          unitIds: [testUnit1.id, testUnit2.id, extraUnit.id, extraUnit.id]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Over-fulfillment prevented');
    });

    it('should enforce concurrency safety so simultaneous requests cannot allocate the same unit twice', async () => {
      const req2Res = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${metroHospToken}`)
        .send({
          requestedComponent: 'RED_BLOOD_CELLS',
          requestedABO: 'A',
          requestedRh: 'POSITIVE',
          requestedQuantity: 1,
          urgency: 'EMERGENCY',
          requiredBy: new Date(Date.now() + 6 * 3600000).toISOString(),
          reason: 'Concurrency test request 2'
        });
      const req2 = req2Res.body.data;

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/requests/${createdRequest.id}/allocations`)
          .set('Authorization', `Bearer ${centralBbToken}`)
          .send({ unitIds: [testUnit1.id] }),
        request(app)
          .post(`/api/requests/${req2.id}/allocations`)
          .set('Authorization', `Bearer ${centralBbToken}`)
          .send({ unitIds: [testUnit1.id] })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses.some((s) => s === 409 || s === 400)).toBe(true);

      const allocCount = await prisma.allocation.count({
        where: { bloodUnitId: testUnit1.id, status: 'RESERVED' }
      });
      expect(allocCount).toBe(1);

      await prisma.bloodRequest.delete({ where: { id: req2.id } });
    });

    it('should forbid unauthorized cross-hospital allocation (403)', async () => {
      const res = await request(app)
        .post(`/api/requests/${createdRequest.id}/allocations`)
        .set('Authorization', `Bearer ${stJudeHospToken}`)
        .send({
          unitIds: [testUnit1.id]
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });
});

