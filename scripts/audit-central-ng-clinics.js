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
  throw new Error('DATABASE_URL do central nao encontrado para auditoria.');
}

if (!ngDatabaseUrl) {
  throw new Error('DATABASE_URL do WhatsApp NG nao encontrado para auditoria.');
}

const central = new CentralPrismaClient({
  datasources: { db: { url: centralDatabaseUrl } },
});
const ng = new NgPrismaClient({
  datasources: { db: { url: ngDatabaseUrl } },
});

const buildClinicFlags = (clinic, ngInstance) => {
  const users = Number(clinic?._count?.users || 0);
  const patients = Number(clinic?._count?.patients || 0);
  const appointments = Number(clinic?._count?.appointments || 0);
  const financialAccounts = Number(clinic?._count?.financialAccounts || 0);
  const outboundMessages = Number(clinic?._count?.outboundMessages || 0);

  return {
    hasUsers: users > 0,
    hasPatients: patients > 0,
    hasAppointments: appointments > 0,
    hasFinancialAccounts: financialAccounts > 0,
    hasOutboundMessages: outboundMessages > 0,
    hasNgInstance: Boolean(ngInstance),
    likelyMigrationResidue: (
      users === 0 ||
      (patients > 0 && financialAccounts === 0) ||
      (appointments > 0 && !ngInstance && outboundMessages > 0)
    ),
  };
};

async function main() {
  const [clinics, ngInstances] = await Promise.all([
    central.clinic.findMany({
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
    }),
    ng.whatsAppInstance.findMany({
      select: {
        id: true,
        clinicId: true,
        status: true,
        phoneNumber: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messageJobs: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const ngByClinicId = new Map(ngInstances.map((item) => [String(item.clinicId || '').trim(), item]));
  const clinicRows = clinics.map((clinic) => {
    const ngInstance = ngByClinicId.get(String(clinic.id || '').trim()) || null;
    return {
      clinicId: clinic.id,
      nomeFantasia: clinic.nomeFantasia,
      razaoSocial: clinic.razaoSocial || '',
      cnpjCpf: clinic.cnpjCpf || '',
      createdAt: clinic.createdAt,
      users: clinic._count.users,
      patients: clinic._count.patients,
      appointments: clinic._count.appointments,
      financialAccounts: clinic._count.financialAccounts,
      outboundMessages: clinic._count.outboundMessages,
      ngInstanceId: ngInstance?.id || '',
      ngStatus: ngInstance?.status || '',
      ngDisplayName: ngInstance?.displayName || '',
      ngPhoneNumber: ngInstance?.phoneNumber || '',
      ngMessageJobs: Number(ngInstance?._count?.messageJobs || 0),
      flags: buildClinicFlags(clinic, ngInstance),
    };
  });

  const orphanNgInstances = ngInstances
    .filter((instance) => !clinics.some((clinic) => clinic.id === instance.clinicId))
    .map((instance) => ({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      status: instance.status,
      displayName: instance.displayName || '',
      phoneNumber: instance.phoneNumber || '',
      messageJobs: Number(instance?._count?.messageJobs || 0),
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    centralClinicCount: clinicRows.length,
    ngInstanceCount: ngInstances.length,
    summary: {
      clinicsWithFinancialAccounts: clinicRows.filter((item) => item.financialAccounts > 0).length,
      clinicsWithNgInstance: clinicRows.filter((item) => item.ngInstanceId).length,
      likelyMigrationResidue: clinicRows.filter((item) => item.flags.likelyMigrationResidue).length,
      orphanNgInstances: orphanNgInstances.length,
    },
    clinics: clinicRows,
    orphanNgInstances,
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('AUDIT_CENTRAL_NG_CLINICS_ERROR');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      central.$disconnect(),
      ng.$disconnect(),
    ]);
  });
