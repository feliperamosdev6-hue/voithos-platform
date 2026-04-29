require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const LEGACY_END_DATE_RAW = String(process.env.SUBSCRIPTION_LEGACY_END_DATE || '').trim();

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid SUBSCRIPTION_LEGACY_END_DATE: ${value}`);
  }
  return parsed;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const run = async () => {
  const apply = process.argv.includes('--apply');
  const now = new Date();
  const endDate = parseOptionalDate(LEGACY_END_DATE_RAW);
  const graceUntil = endDate ? addDays(endDate, 3) : null;

  const clinicsWithoutSubscription = await prisma.clinic.findMany({
    where: {
      subscription: {
        is: null,
      },
    },
    select: {
      id: true,
      nomeFantasia: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.info('[subscription][legacy-backfill]', {
    apply,
    legacyEndDate: endDate ? endDate.toISOString() : null,
    clinicsWithoutSubscription: clinicsWithoutSubscription.length,
  });

  if (!apply) {
    clinicsWithoutSubscription.forEach((clinic) => {
      console.info('[subscription][legacy-backfill][dry-run]', {
        clinicId: clinic.id,
        nomeFantasia: clinic.nomeFantasia,
        createdAt: clinic.createdAt,
      });
    });
    return;
  }

  let createdCount = 0;
  for (const clinic of clinicsWithoutSubscription) {
    const existing = await prisma.subscription.findUnique({
      where: {
        clinicId: clinic.id,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.subscription.create({
      data: {
        clinicId: clinic.id,
        planType: 'LEGACY',
        status: 'ACTIVE',
        amount: 0,
        startDate: now,
        endDate,
        graceUntil,
      },
    });

    createdCount += 1;
    console.info('[subscription][legacy-backfill][created]', {
      clinicId: clinic.id,
      nomeFantasia: clinic.nomeFantasia,
    });
  }

  console.info('[subscription][legacy-backfill][completed]', {
    createdCount,
  });
};

run()
  .catch((error) => {
    console.error('[subscription][legacy-backfill][failed]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
