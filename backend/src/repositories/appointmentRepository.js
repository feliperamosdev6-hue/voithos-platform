const { prisma } = require('../db/prisma');
const { toNullableString, toOptionalDate, toRequiredString } = require('../types/repositoryTypes');

const appointmentRepository = {
  findById: async (id) => prisma.appointment.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByIdAndClinic: async (id, clinicId) => prisma.appointment.findFirst({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  listByClinic: async ({ clinicId, from, to, patientId }) => {
    const where = {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    };

    if (patientId) {
      where.patientId = toRequiredString(patientId, 'patientId');
    }

    const fromDate = from ? toOptionalDate(from) : null;
    const toDate = to ? toOptionalDate(to) : null;
    if (fromDate || toDate) {
      where.dataHora = {};
      if (fromDate) where.dataHora.gte = fromDate;
      if (toDate) where.dataHora.lte = toDate;
    }

    return prisma.appointment.findMany({
      where,
      orderBy: {
        dataHora: 'asc',
      },
    });
  },

  listAudienceBaseByClinic: async ({ clinicId, from, to } = {}) => {
    const where = {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    };

    const fromDate = from ? toOptionalDate(from) : null;
    const toDate = to ? toOptionalDate(to) : null;
    if (fromDate || toDate) {
      where.dataHora = {};
      if (fromDate) where.dataHora.gte = fromDate;
      if (toDate) where.dataHora.lte = toDate;
    }

    return prisma.appointment.findMany({
      where,
      select: {
        id: true,
        patientId: true,
        profissionalId: true,
        profissionalNome: true,
        dataHora: true,
        createdAt: true,
        status: true,
        confirmado: true,
        attendanceStatus: true,
      },
      orderBy: {
        dataHora: 'desc',
      },
    });
  },

  create: async (input) => prisma.appointment.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toRequiredString(input?.patientId, 'patientId'),
      profissionalId: toNullableString(input?.profissionalId),
      profissionalNome: toNullableString(input?.profissionalNome),
      dataHora: toOptionalDate(input?.dataHora),
      horaFim: toOptionalDate(input?.horaFim),
      status: toRequiredString(input?.status, 'status'),
      confirmado: input?.confirmado === true,
      attendanceStatus: toNullableString(input?.attendanceStatus),
      tipo: toNullableString(input?.tipo),
      observacoes: toNullableString(input?.observacoes),
      marcadorId: toNullableString(input?.marcadorId),
      marcadorNome: toNullableString(input?.marcadorNome),
      marcadorCor: toNullableString(input?.marcadorCor),
    },
  }),

  update: async ({ id, clinicId, data }) => prisma.appointment.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      profissionalId: toNullableString(data?.profissionalId),
      profissionalNome: toNullableString(data?.profissionalNome),
      dataHora: toOptionalDate(data?.dataHora),
      horaFim: toOptionalDate(data?.horaFim),
      tipo: toNullableString(data?.tipo),
      observacoes: toNullableString(data?.observacoes),
      status: toRequiredString(data?.status, 'status'),
      confirmado: data?.confirmado === true,
      attendanceStatus: toNullableString(data?.attendanceStatus),
      marcadorId: toNullableString(data?.marcadorId),
      marcadorNome: toNullableString(data?.marcadorNome),
      marcadorCor: toNullableString(data?.marcadorCor),
    },
  }),

  delete: async ({ id, clinicId }) => prisma.appointment.deleteMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  updateStatus: async ({ id, clinicId, status, confirmado }) => prisma.appointment.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      status: toRequiredString(status, 'status'),
      confirmado: confirmado === true,
    },
  }),

  updateAttendanceStatus: async ({ id, clinicId, attendanceStatus }) => prisma.appointment.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      attendanceStatus: toNullableString(attendanceStatus),
    },
  }),

  listByPatient: async ({ clinicId, patientId }) => prisma.appointment.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      patientId: toRequiredString(patientId, 'patientId'),
    },
    orderBy: {
      dataHora: 'asc',
    },
  }),
};

module.exports = { appointmentRepository };
