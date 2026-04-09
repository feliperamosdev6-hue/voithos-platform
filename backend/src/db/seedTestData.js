const { prisma } = require('./prisma');
const { run: createTestUser } = require('./createTestUser');
const { patientRepository } = require('../repositories/patientRepository');

const run = async () => {
  const authSeed = await createTestUser();
  const patientEmail = process.env.TEST_PATIENT_EMAIL || 'patient@voithos.local';

  let patient = await prisma.patient.findFirst({
    where: { email: patientEmail },
  });

  if (!patient) {
    patient = await patientRepository.create({
      clinicId: authSeed.clinic.id,
      nome: 'Paciente Teste',
      telefone: '11999999999',
      email: patientEmail,
    });
  }

  return {
    clinic: authSeed.clinic,
    user: authSeed.user,
    password: authSeed.password,
    patient: {
      id: patient.id,
      nome: patient.nome,
      clinicId: patient.clinicId,
      email: patient.email,
    },
  };
};

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify({
        ok: true,
        data: result,
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        ok: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || String(error),
        },
      }, null, 2));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => {});
    });
}

module.exports = { run };
