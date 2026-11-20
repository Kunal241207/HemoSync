import '../src/config/index.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🩸 --- Starting HemoSync Synthetic Data Seeding (Module 2: Complete Database Architecture) ---');

  // 1. System Settings
  console.log('1. Seeding system settings...');
  await prisma.systemSetting.upsert({
    where: { key: 'PLATFORM_INITIALIZED' },
    update: { value: 'true' },
    create: {
      key: 'PLATFORM_INITIALIZED',
      value: 'true',
      description: 'System initialization status for HemoSync'
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'SYSTEM_VERSION' },
    update: { value: '2.0.0' },
    create: {
      key: 'SYSTEM_VERSION',
      value: '2.0.0',
      description: 'Current HemoSync database architecture version'
    }
  });

  // 2. Institutions (Hospitals & Blood Banks)
  console.log('2. Seeding participating institutions with synthetic geolocation...');

  // Hospital 1: Metro General Hospital
  const metroGeneral = await prisma.institution.upsert({
    where: { licenseNumber: 'HOSP-MA-2024-001' },
    update: {},
    create: {
      name: 'Metro General Hospital',
      type: 'HOSPITAL',
      address: '55 Fruit St, Boston, MA 02114',
      latitude: 42.3629,
      longitude: -71.0694,
      licenseNumber: 'HOSP-MA-2024-001',
      phone: '+1-617-726-2000',
      email: 'bloodbank@metrogeneral.org',
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  // Hospital 2: St. Jude Medical Pavilion
  const stJude = await prisma.institution.upsert({
    where: { licenseNumber: 'HOSP-MA-2024-002' },
    update: {},
    create: {
      name: 'St. Jude Medical Pavilion',
      type: 'HOSPITAL',
      address: '75 Francis St, Boston, MA 02115',
      latitude: 42.3361,
      longitude: -71.1065,
      licenseNumber: 'HOSP-MA-2024-002',
      phone: '+1-617-732-5500',
      email: 'transfusion@stjudepavilion.org',
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  // Blood Bank 1: Central Regional Blood Center
  const centralBloodBank = await prisma.institution.upsert({
    where: { licenseNumber: 'BB-MA-2024-101' },
    update: {},
    create: {
      name: 'Central Regional Blood Center',
      type: 'BLOOD_BANK',
      address: '180 Rustcraft Rd, Dedham, MA 02026',
      latitude: 42.2348,
      longitude: -71.1719,
      licenseNumber: 'BB-MA-2024-101',
      phone: '+1-781-461-2000',
      email: 'inventory@centralblood.org',
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  // Blood Bank 2: LifeStream Community Blood Bank
  const lifeStreamBloodBank = await prisma.institution.upsert({
    where: { licenseNumber: 'BB-MA-2024-102' },
    update: {},
    create: {
      name: 'LifeStream Community Blood Bank',
      type: 'BLOOD_BANK',
      address: '270 Albany St, Cambridge, MA 02139',
      latitude: 42.3614,
      longitude: -71.0965,
      licenseNumber: 'BB-MA-2024-102',
      phone: '+1-617-253-1000',
      email: 'operations@lifestreamblood.org',
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  console.log(`   Seeded ${4} institutions.`);

  // 3. Users for each role & institution
  console.log('3. Seeding users with secure bcrypt password hashes...');
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // Platform Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@hemosync.org' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'Eleanor Vance',
      email: 'admin@hemosync.org',
      passwordHash: defaultPasswordHash,
      role: 'PLATFORM_ADMIN',
      isActive: true
    }
  });

  // Developer User (Accesses Dev Tools via *.hemo@dev.com)
  await prisma.user.upsert({
    where: { email: 'alex.hemo@dev.com' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'Alex Chen',
      email: 'alex.hemo@dev.com',
      passwordHash: defaultPasswordHash,
      role: 'PLATFORM_ADMIN',
      isActive: true
    }
  });

  // Hospital Staff - Metro General
  const metroStaff = await prisma.user.upsert({
    where: { email: 'staff@metrogeneral.org' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'Marcus Reed',
      email: 'staff@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: 'HOSPITAL_STAFF',
      institutionId: metroGeneral.id,
      isActive: true
    }
  });

  // Hospital Staff - St Jude
  const stJudeStaff = await prisma.user.upsert({
    where: { email: 'staff@stjudepavilion.org' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'Sarah Jenkins',
      email: 'staff@stjudepavilion.org',
      passwordHash: defaultPasswordHash,
      role: 'HOSPITAL_STAFF',
      institutionId: stJude.id,
      isActive: true
    }
  });

  // Blood Bank Staff - Central Blood
  const centralBbStaff = await prisma.user.upsert({
    where: { email: 'manager@centralblood.org' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'David Kim',
      email: 'manager@centralblood.org',
      passwordHash: defaultPasswordHash,
      role: 'BLOOD_BANK_STAFF',
      institutionId: centralBloodBank.id,
      isActive: true
    }
  });

  // Blood Bank Staff - LifeStream
  const lifeStreamStaff = await prisma.user.upsert({
    where: { email: 'logistics@lifestreamblood.org' },
    update: { passwordHash: defaultPasswordHash },
    create: {
      name: 'Maria Garcia',
      email: 'logistics@lifestreamblood.org',
      passwordHash: defaultPasswordHash,
      role: 'BLOOD_BANK_STAFF',
      institutionId: lifeStreamBloodBank.id,
      isActive: true
    }
  });

  console.log(`   Seeded 5 users across roles and institutions.`);

  // 4. Physical Blood Units (ISBT-128 styled unitCodes)
  console.log('4. Seeding individual physical blood units with FEFO expiry timestamps...');
  const now = new Date();

  const syntheticUnits = [
    // Central Blood Bank Stock
    {
      unitCode: 'W0365-26-00001',
      institutionId: centralBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'O',
      rhFactor: 'NEGATIVE',
      volumeMl: 450,
      collectionDate: new Date(Date.now() - 10 * 86400000),
      expiryDate: new Date(Date.now() + 32 * 86400000), // ~32 days left
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00002',
      institutionId: centralBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'O',
      rhFactor: 'POSITIVE',
      volumeMl: 470,
      collectionDate: new Date(Date.now() - 15 * 86400000),
      expiryDate: new Date(Date.now() + 27 * 86400000),
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00003',
      institutionId: centralBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'A',
      rhFactor: 'POSITIVE',
      volumeMl: 460,
      collectionDate: new Date(Date.now() - 38 * 86400000),
      expiryDate: new Date(Date.now() + 4 * 86400000), // Near expiry! 4 days left
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00004',
      institutionId: centralBloodBank.id,
      componentType: 'PLATELETS',
      aboGroup: 'A',
      rhFactor: 'POSITIVE',
      volumeMl: 280,
      collectionDate: new Date(Date.now() - 3 * 86400000),
      expiryDate: new Date(Date.now() + 2 * 86400000), // Platelet short shelf-life (2 days left)
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00005',
      institutionId: centralBloodBank.id,
      componentType: 'PLASMA',
      aboGroup: 'AB',
      rhFactor: 'POSITIVE',
      volumeMl: 310,
      collectionDate: new Date(Date.now() - 60 * 86400000),
      expiryDate: new Date(Date.now() + 305 * 86400000), // Frozen plasma long shelf-life
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00006',
      institutionId: centralBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'B',
      rhFactor: 'NEGATIVE',
      volumeMl: 440,
      collectionDate: new Date(Date.now() - 1 * 86400000),
      expiryDate: new Date(Date.now() + 41 * 86400000),
      testingStatus: 'PENDING',
      releaseStatus: 'QUARANTINED',
      inventoryStatus: 'QUARANTINED'
    },
    // LifeStream Blood Bank Stock
    {
      unitCode: 'W0365-26-00007',
      institutionId: lifeStreamBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'O',
      rhFactor: 'NEGATIVE',
      volumeMl: 480,
      collectionDate: new Date(Date.now() - 8 * 86400000),
      expiryDate: new Date(Date.now() + 34 * 86400000),
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00008',
      institutionId: lifeStreamBloodBank.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'AB',
      rhFactor: 'NEGATIVE',
      volumeMl: 450,
      collectionDate: new Date(Date.now() - 12 * 86400000),
      expiryDate: new Date(Date.now() + 30 * 86400000),
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    {
      unitCode: 'W0365-26-00009',
      institutionId: lifeStreamBloodBank.id,
      componentType: 'PLATELETS',
      aboGroup: 'O',
      rhFactor: 'POSITIVE',
      volumeMl: 260,
      collectionDate: new Date(Date.now() - 2 * 86400000),
      expiryDate: new Date(Date.now() + 3 * 86400000),
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    },
    // Metro General Hospital Local Stock
    {
      unitCode: 'W0365-26-00010',
      institutionId: metroGeneral.id,
      componentType: 'RED_BLOOD_CELLS',
      aboGroup: 'A',
      rhFactor: 'POSITIVE',
      volumeMl: 450,
      collectionDate: new Date(Date.now() - 14 * 86400000),
      expiryDate: new Date(Date.now() + 28 * 86400000),
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      inventoryStatus: 'AVAILABLE'
    }
  ];

  const createdUnits = [];
  for (const unitData of syntheticUnits) {
    const unit = await prisma.bloodUnit.upsert({
      where: { unitCode: unitData.unitCode },
      update: {},
      create: unitData
    });
    createdUnits.push(unit);

    // Seed initial inventory event for each unit
    await prisma.inventoryEvent.create({
      data: {
        bloodUnitId: unit.id,
        eventType: 'REGISTRATION',
        previousStatus: null,
        newStatus: unit.inventoryStatus,
        actorId: centralBbStaff.id,
        notes: `Synthetic registration of ${unit.componentType} ${unit.aboGroup}${unit.rhFactor === 'POSITIVE' ? '+' : '-'} unit ${unit.unitCode}`,
        timestamp: unit.collectionDate
      }
    });
  }

  console.log(`   Seeded ${createdUnits.length} physical blood units and inventory events.`);

  // 5. Expiry Alert for the near-expiry unit
  console.log('5. Seeding near-expiry alert for unit W0365-26-00003...');
  const nearExpiryUnit = createdUnits.find(u => u.unitCode === 'W0365-26-00003');
  if (nearExpiryUnit) {
    await prisma.expiryAlert.create({
      data: {
        bloodUnitId: nearExpiryUnit.id,
        institutionId: centralBloodBank.id,
        severity: 'HIGH',
        resolved: false
      }
    });
  }

  // 6. Blood Requests from Hospitals
  console.log('6. Seeding hospital blood requests...');
  const urgentRequest = await prisma.bloodRequest.create({
    data: {
      hospitalId: metroGeneral.id,
      createdById: metroStaff.id,
      requestedComponent: 'RED_BLOOD_CELLS',
      requestedABO: 'O',
      requestedRh: 'NEGATIVE',
      requestedQuantity: 2,
      urgency: 'EMERGENCY',
      status: 'PENDING',
      requiredBy: new Date(Date.now() + 6 * 3600000), // Needed within 6 hours
      reason: 'Level 1 Trauma resuscitation in Bay 4'
    }
  });

  const routineRequest = await prisma.bloodRequest.create({
    data: {
      hospitalId: stJude.id,
      createdById: stJudeStaff.id,
      requestedComponent: 'PLATELETS',
      requestedABO: 'A',
      requestedRh: 'POSITIVE',
      requestedQuantity: 1,
      urgency: 'ROUTINE',
      status: 'PENDING',
      requiredBy: new Date(Date.now() + 24 * 3600000),
      reason: 'Scheduled oncology chemotherapy patient transfusion'
    }
  });

  console.log(`   Seeded blood requests (Emergency ID: ${urgentRequest.id.slice(0, 8)}, Routine ID: ${routineRequest.id.slice(0, 8)}).`);

  // 7. Synthetic Demand Forecast Records (Module 10 / AI engine contract)
  console.log('7. Seeding baseline demand forecasts...');
  const forecastDates = [1, 2, 3, 4, 5, 6, 7].map(d => new Date(Date.now() + d * 86400000));
  for (const date of forecastDates) {
    await prisma.demandForecast.create({
      data: {
        institutionId: metroGeneral.id,
        componentType: 'RED_BLOOD_CELLS',
        aboGroup: 'O',
        rhFactor: 'NEGATIVE',
        forecastDate: date,
        horizonDays: 7,
        predictedDemand: 3.5,
        lowerBound: 2.1,
        upperBound: 5.2,
        modelVersion: 'v1.0-synthetic-baseline',
        metrics: { historicalDays: 180, mape: null, wape: 0.12 }
      }
    });
  }

  // 8. Notifications
  console.log('8. Seeding initial staff notifications...');
  await prisma.notification.create({
    data: {
      recipientUserId: centralBbStaff.id,
      title: '🚨 Emergency Blood Request Submitted',
      message: 'Metro General Hospital has submitted an EMERGENCY request for 2 units of O- Negative Red Blood Cells.',
      createdAt: new Date()
    }
  });

  // 9. Initial Audit Log
  console.log('9. Recording initialization audit logs...');
  await prisma.auditLog.create({
    data: {
      actorId: adminUser.id,
      institutionId: null,
      entityType: 'PLATFORM',
      entityId: 'SYSTEM',
      action: 'CREATE',
      metadata: {
        event: 'DATABASE_INITIALIZATION',
        version: '2.0.0',
        institutionsCount: 4,
        unitsCount: createdUnits.length
      }
    }
  });

  console.log('✅ HemoSync Database Seeding (Module 2) Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
