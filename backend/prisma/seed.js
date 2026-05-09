const prisma = require('../config/prisma');

const states = [
  [1, 'Active'],
  [2, 'Qualified'],
  [3, 'Archived'],
  [4, 'Won'],
  [5, 'Lost'],
  [6, 'Waiting Approval'],
  [7, 'Approved'],
  [8, 'On Revision']
];

const users = [
  ['local-admin', 'Admin User', 'admin@r2.local'],
  ['local-sales', 'Sales User', 'sales@r2.local'],
  ['local-project-manager', 'Project Manager User', 'project.manager@r2.local'],
  ['local-technician', 'Technician User', 'technician@r2.local']
];

async function main() {
  for (const [stateId, name] of states) {
    await prisma.state.upsert({
      where: { stateId },
      update: { name },
      create: { stateId, name }
    });
  }

  for (const [userId, name, email] of users) {
    await prisma.user.upsert({
      where: { userId },
      update: { name, email },
      create: { userId, name, email }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
