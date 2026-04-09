const { prisma } = require('../db/prisma');

const laboratoryRepository = {
  findPatientByIdAndClinic: async ({ clinicId, patientId }) => prisma.patient.findFirst({
    where: { clinicId, id: patientId },
  }),

  findAppointmentByIdAndClinic: async ({ clinicId, appointmentId }) => prisma.appointment.findFirst({
    where: { clinicId, id: appointmentId },
  }),

  findProcedureByIdAndClinic: async ({ clinicId, procedureId }) => prisma.patientProcedure.findFirst({
    where: { clinicId, id: procedureId },
  }),

  findProcedureByExternalId: async ({ clinicId, patientId, externalId }) => prisma.patientProcedure.findFirst({
    where: { clinicId, patientId, externalId },
  }),

  listOrdersByClinic: async ({ clinicId }) => prisma.laboratoryOrder.findMany({
    where: { clinicId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
    orderBy: { createdAt: 'desc' },
  }),

  listOrdersByPatient: async ({ clinicId, patientId }) => prisma.laboratoryOrder.findMany({
    where: { clinicId, patientId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  }),

  findOrderByIdAndClinic: async ({ clinicId, orderId }) => prisma.laboratoryOrder.findFirst({
    where: { clinicId, id: orderId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
  }),

  findOrderByExternalReference: async ({ clinicId, externalReference }) => prisma.laboratoryOrder.findFirst({
    where: { clinicId, externalReference },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  }),

  createOrder: async (data) => prisma.laboratoryOrder.create({
    data,
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
  }),

  updateOrder: async ({ orderId, data }) => prisma.laboratoryOrder.update({
    where: { id: orderId },
    data,
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
  }),

  deleteOrder: async ({ clinicId, orderId }) => prisma.laboratoryOrder.deleteMany({
    where: { clinicId, id: orderId },
  }),

  createEvent: async (data) => prisma.laboratoryOrderEvent.create({ data }),

  listItemsByOrder: async ({ clinicId, orderId }) => prisma.laboratoryOrderItem.findMany({
    where: { clinicId, orderId },
    orderBy: { createdAt: 'asc' },
  }),

  findItemByIdAndClinic: async ({ clinicId, itemId }) => prisma.laboratoryOrderItem.findFirst({
    where: { clinicId, id: itemId },
  }),

  createItem: async (data) => prisma.laboratoryOrderItem.create({ data }),

  updateItem: async ({ itemId, data }) => prisma.laboratoryOrderItem.update({
    where: { id: itemId },
    data,
  }),

  deleteItem: async ({ clinicId, itemId }) => prisma.laboratoryOrderItem.deleteMany({
    where: { clinicId, id: itemId },
  }),
};

module.exports = { laboratoryRepository };
