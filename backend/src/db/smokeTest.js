const { prisma } = require('./prisma');

const runSmokeTest = async () => {
  await prisma.$connect();

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      current_database() AS database_name,
      current_schema() AS schema_name,
      (
        SELECT COUNT(*)::int
        FROM information_schema.tables
        WHERE table_schema = current_schema()
      ) AS table_count
  `);

  return rows[0] || null;
};

if (require.main === module) {
  runSmokeTest()
    .then((result) => {
      console.log(JSON.stringify({
        success: true,
        data: result,
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        success: false,
        error: error.message || String(error),
      }, null, 2));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => {});
    });
}

module.exports = { runSmokeTest };
