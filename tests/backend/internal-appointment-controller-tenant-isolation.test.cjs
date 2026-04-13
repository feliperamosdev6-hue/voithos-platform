const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const createResponseDouble = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

test('internalAppointmentController.resolveInternalAppointmentId usa lookup de paciente scoped por clinicId', async (t) => {
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/internalAppointmentController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => null,
          listByClinic: async () => [{
            id: 'appt-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            profissionalId: '',
            dataHora: '2026-04-13T10:00:00.000Z',
          }],
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => {
            throw new Error('global patient lookup should not run');
          },
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            nome: 'Maria',
            telefone: '5511999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/appointmentService.js')]: { appointmentService: {} },
    }
  );
  t.after(restore);

  const req = {
    body: {
      clinicId: 'clinic-auth',
      appointment: {
        data: '2026-04-13',
        horaInicio: '10:00',
        pacienteNome: 'Maria',
      },
      patient: {
        nome: 'Maria',
        telefone: '11999999999',
      },
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.resolveInternalAppointmentId(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    ok: true,
    data: {
      id: 'appt-1',
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    },
  });
});
