const fs = require('fs');
const path = require('path');
const { PrismaClient: CentralPrismaClient } = require('../node_modules/@prisma/client');
const { PrismaClient: NgPrismaClient } = require('../whatsapp-engine/node_modules/@prisma/client');

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      acc[key] = value;
      return acc;
    }, {});
};

const rootEnv = readEnvFile(path.resolve(__dirname, '..', '.env'));
const ngEnv = readEnvFile(path.resolve(__dirname, '..', 'whatsapp-engine', '.env'));

const centralDatabaseUrl = String(rootEnv.DATABASE_URL || process.env.DATABASE_URL || '').trim();
const ngDatabaseUrl = String(ngEnv.DATABASE_URL || centralDatabaseUrl || '').trim();

if (!centralDatabaseUrl) {
  throw new Error('DATABASE_URL do central nao encontrado.');
}

if (!ngDatabaseUrl) {
  throw new Error('DATABASE_URL do WhatsApp NG nao encontrado.');
}

const central = new CentralPrismaClient({
  datasources: { db: { url: centralDatabaseUrl } },
});

const ng = new NgPrismaClient({
  datasources: { db: { url: ngDatabaseUrl } },
});

const keepClinicId = String(process.argv[2] || '').trim();
const execute = process.argv.includes('--execute');

if (!keepClinicId) {
  throw new Error('Informe o clinicId a preservar. Ex.: node scripts/cleanup-central-and-ng-clinics.js <clinicId> [--execute]');
}

const toIds = (items, key = 'id') => items.map((item) => String(item?.[key] || '').trim()).filter(Boolean);

async function loadCentralBackupData(clinicIds) {
  return {
    clinics: await central.clinic.findMany({ where: { id: { in: clinicIds } } }),
    users: await central.user.findMany({ where: { clinicId: { in: clinicIds } } }),
    sessions: await central.session.findMany({
      where: {
        user: {
          clinicId: { in: clinicIds },
        },
      },
    }),
    patients: await central.patient.findMany({ where: { clinicId: { in: clinicIds } } }),
    appointments: await central.appointment.findMany({ where: { clinicId: { in: clinicIds } } }),
    outboundMessages: await central.outboundMessage.findMany({ where: { clinicId: { in: clinicIds } } }),
    inboundMessages: await central.inboundMessage.findMany({ where: { clinicId: { in: clinicIds } } }),
    notificationEvents: await central.notificationEvent.findMany({ where: { clinicId: { in: clinicIds } } }),
    appointmentActionTokens: await central.appointmentActionToken.findMany({ where: { clinicId: { in: clinicIds } } }),
    patientClinicalRecords: await central.patientClinicalRecord.findMany({ where: { clinicId: { in: clinicIds } } }),
    anamneses: await central.anamnesis.findMany({ where: { clinicId: { in: clinicIds } } }),
    clinicalNotes: await central.clinicalNote.findMany({ where: { clinicId: { in: clinicIds } } }),
    patientProcedures: await central.patientProcedure.findMany({ where: { clinicId: { in: clinicIds } } }),
    patientDocumentMetadata: await central.patientDocumentMetadata.findMany({ where: { clinicId: { in: clinicIds } } }),
    financialAccounts: await central.financialAccount.findMany({ where: { clinicId: { in: clinicIds } } }),
    financialInstallments: await central.financialInstallment.findMany({ where: { clinicId: { in: clinicIds } } }),
    financialTransactions: await central.financialTransaction.findMany({ where: { clinicId: { in: clinicIds } } }),
    patientPlans: await central.patientPlan.findMany({ where: { clinicId: { in: clinicIds } } }),
    financialSnapshots: await central.financialSnapshot.findMany({ where: { clinicId: { in: clinicIds } } }),
    laboratoryOrders: await central.laboratoryOrder.findMany({ where: { clinicId: { in: clinicIds } } }),
    laboratoryOrderItems: await central.laboratoryOrderItem.findMany({ where: { clinicId: { in: clinicIds } } }),
    laboratoryOrderEvents: await central.laboratoryOrderEvent.findMany({ where: { clinicId: { in: clinicIds } } }),
  };
}

async function loadNgBackupData(clinicIds) {
  return {
    instances: await ng.whatsAppInstance.findMany({ where: { clinicId: { in: clinicIds } } }),
    jobs: await ng.messageJob.findMany({ where: { clinicId: { in: clinicIds } } }),
    logs: await ng.messageLog.findMany({
      where: {
        job: {
          clinicId: { in: clinicIds },
        },
      },
    }),
  };
}

async function buildReport() {
  const clinics = await central.clinic.findMany({
    select: {
      id: true,
      nomeFantasia: true,
      razaoSocial: true,
      cnpjCpf: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          patients: true,
          appointments: true,
          financialAccounts: true,
          outboundMessages: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const ngInstances = await ng.whatsAppInstance.findMany({
    select: {
      id: true,
      clinicId: true,
      status: true,
      displayName: true,
      phoneNumber: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messageJobs: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const clinicsToDelete = clinics.filter((item) => item.id !== keepClinicId);
  const clinicIdsToDelete = clinicsToDelete.map((item) => item.id);
  const keptClinic = clinics.find((item) => item.id === keepClinicId) || null;
  const ngInstancesToDelete = ngInstances.filter((item) => item.clinicId !== keepClinicId);

  return {
    generatedAt: new Date().toISOString(),
    keepClinicId,
    keptClinic,
    deleteClinicCount: clinicsToDelete.length,
    deleteNgInstanceCount: ngInstancesToDelete.length,
    clinicsToDelete: clinicsToDelete.map((clinic) => ({
      clinicId: clinic.id,
      nomeFantasia: clinic.nomeFantasia,
      razaoSocial: clinic.razaoSocial || '',
      cnpjCpf: clinic.cnpjCpf || '',
      users: clinic._count.users,
      patients: clinic._count.patients,
      appointments: clinic._count.appointments,
      financialAccounts: clinic._count.financialAccounts,
      outboundMessages: clinic._count.outboundMessages,
      hasNgInstance: ngInstancesToDelete.some((instance) => instance.clinicId === clinic.id),
    })),
    ngInstancesToDelete: ngInstancesToDelete.map((instance) => ({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      status: instance.status,
      displayName: instance.displayName || '',
      phoneNumber: instance.phoneNumber || '',
      messageJobs: instance._count.messageJobs,
    })),
  };
}

async function deleteCentralClinicData(clinicIds) {
  const users = await central.user.findMany({
    where: { clinicId: { in: clinicIds } },
    select: { id: true },
  });
  const userIds = toIds(users);

  await central.$transaction([
    central.appointmentActionToken.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.notificationEvent.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.inboundMessage.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.outboundMessage.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.financialTransaction.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.financialInstallment.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.laboratoryOrderEvent.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.laboratoryOrderItem.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.financialAccount.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.patientPlan.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.financialSnapshot.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.laboratoryOrder.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.patientProcedure.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.clinicalNote.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.anamnesis.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.patientDocumentMetadata.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.patientClinicalRecord.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.appointment.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    ...(userIds.length ? [central.session.deleteMany({ where: { userId: { in: userIds } } })] : []),
    central.user.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.patient.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    central.clinic.deleteMany({ where: { id: { in: clinicIds } } }),
  ]);
}

async function deleteNgClinicData(clinicIds) {
  await ng.$transaction([
    ng.messageJob.deleteMany({ where: { clinicId: { in: clinicIds } } }),
    ng.whatsAppInstance.deleteMany({ where: { clinicId: { in: clinicIds } } }),
  ]);
}

async function main() {
  const report = await buildReport();

  if (!report.keptClinic) {
    throw new Error(`Clinica a preservar nao encontrada: ${keepClinicId}`);
  }

  const clinicIdsToDelete = report.clinicsToDelete.map((item) => item.clinicId);

  if (!execute) {
    console.log(JSON.stringify({ mode: 'dry-run', ...report }, null, 2));
    return;
  }

  const backupDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `cleanup-clinics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  const [centralBackup, ngBackup] = await Promise.all([
    loadCentralBackupData(clinicIdsToDelete),
    loadNgBackupData(clinicIdsToDelete),
  ]);

  fs.writeFileSync(backupFile, JSON.stringify({
    report,
    centralBackup,
    ngBackup,
  }, null, 2), 'utf8');

  await deleteNgClinicData(clinicIdsToDelete);
  await deleteCentralClinicData(clinicIdsToDelete);

  const [remainingClinics, remainingNgInstances] = await Promise.all([
    central.clinic.findMany({
      select: { id: true, nomeFantasia: true },
      orderBy: { createdAt: 'asc' },
    }),
    ng.whatsAppInstance.findMany({
      select: { id: true, clinicId: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  console.log(JSON.stringify({
    mode: 'execute',
    keepClinicId,
    backupFile,
    deletedClinicIds: clinicIdsToDelete,
    remainingClinics,
    remainingNgInstances,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('CLEANUP_CENTRAL_AND_NG_CLINICS_ERROR');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      central.$disconnect(),
      ng.$disconnect(),
    ]);
  });
