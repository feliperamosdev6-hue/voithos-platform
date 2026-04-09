const { AppError } = require('../errors/AppError');
const { prisma } = require('./prisma');
const { authService } = require('../services/authService');
const { clinicRepository } = require('../repositories/clinicRepository');
const { userRepository } = require('../repositories/userRepository');

const isMissingTableError = (error) => error && error.code === 'P2021';

const run = async () => {
  const clinicEmail = process.env.TEST_CLINIC_EMAIL || 'clinic.test@voithos.local';
  const userEmail = String(process.env.TEST_USER_EMAIL || 'admin@voithos.local').trim().toLowerCase();
  const password = process.env.TEST_USER_PASSWORD || '123456';

  try {
    let clinic = await clinicRepository.findByEmail(clinicEmail);
    if (!clinic) {
      clinic = await clinicRepository.create({
        nomeFantasia: 'Voithos Test Clinic',
        razaoSocial: 'Voithos Test Clinic LTDA',
        email: clinicEmail,
      });
    }

    let user = await userRepository.findByEmail(userEmail);
    if (!user) {
      const passwordHash = await authService.hashPassword(password);
      user = await userRepository.create({
        clinicId: clinic.id,
        nome: 'Admin Teste',
        email: userEmail,
        passwordHash,
        role: 'admin',
        ativo: true,
      });
    }

    return {
      clinic: {
        id: clinic.id,
        nomeFantasia: clinic.nomeFantasia,
        email: clinic.email,
      },
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
      },
      password,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet. Run migrations later before creating a test user.');
    }
    throw error;
  }
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
