import { AccountStatus, PrismaClient, Priority, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Seed data ────────────────────────────────────────────────────────────────

const USERS: Array<{
  email: string;
  name: string;
  department: string;
  roles: RoleName[];
}> = [
  {
    email: 'employee@test.com',
    name: 'Test Employee',
    department: 'Engineering',
    roles: [RoleName.EMPLOYEE],
  },
  {
    email: 'agent@test.com',
    name: 'Test Agent',
    department: 'IT',
    roles: [RoleName.AGENT],
  },
  {
    email: 'admin@test.com',
    name: 'Test IT Admin',
    department: 'IT',
    roles: [RoleName.IT_ADMIN],
  },
  {
    email: 'l2@test.com',
    name: 'Test L2/L3 Engineer',
    department: 'IT',
    roles: [RoleName.L2_L3],
  },
  {
    email: 'manager@test.com',
    name: 'Test Manager',
    department: 'Engineering',
    roles: [RoleName.MANAGER, RoleName.EMPLOYEE],
  },
  {
    email: 'finance@test.com',
    name: 'Test Finance',
    department: 'Finance',
    roles: [RoleName.FINANCE],
  },
  {
    email: 'sysadmin@test.com',
    name: 'Test SysAdmin',
    department: 'IT',
    roles: [RoleName.SYS_ADMIN],
  },
];

const CATEGORIES = [
  'Hardware/Device',
  'Network',
  'Software - Not Working',
  'Software - Installation',
  'Access/Account',
  'Other',
];

const SLA_POLICIES: Array<{
  priority: Priority;
  responseTargetHours: number;
  resolutionTargetHours: number;
}> = [
  // Section 4.5.2 values
  { priority: Priority.CRITICAL, responseTargetHours: 1, resolutionTargetHours: 8 },
  { priority: Priority.HIGH,     responseTargetHours: 2, resolutionTargetHours: 8 },
  { priority: Priority.MEDIUM,   responseTargetHours: 4, resolutionTargetHours: 16 },
  { priority: Priority.LOW,      responseTargetHours: 8, resolutionTargetHours: 24 },
];

const CALENDAR_ID = 'cal-default';

// ─── Seed logic ───────────────────────────────────────────────────────────────

async function seedRoles(): Promise<Record<RoleName, string>> {
  const roleMap = {} as Record<RoleName, string>;
  for (const name of Object.values(RoleName)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roleMap[name] = role.id;
  }
  console.log(`  ✓ ${Object.keys(roleMap).length} roles`);
  return roleMap;
}

async function seedCalendar(): Promise<void> {
  await prisma.businessCalendar.upsert({
    where: { id: CALENDAR_ID },
    update: {},
    create: {
      id: CALENDAR_ID,
      name: 'Default 5×8',
      workingDays: [1, 2, 3, 4, 5], // Mon–Fri
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      holidays: [],
    },
  });
  console.log('  ✓ business calendar');
}

async function seedSLAPolicies(): Promise<void> {
  for (const sla of SLA_POLICIES) {
    await prisma.sLAPolicy.upsert({
      where: { priority: sla.priority },
      update: {
        responseTargetHours: sla.responseTargetHours,
        resolutionTargetHours: sla.resolutionTargetHours,
      },
      create: {
        priority: sla.priority,
        responseTargetHours: sla.responseTargetHours,
        resolutionTargetHours: sla.resolutionTargetHours,
        calendarId: CALENDAR_ID,
      },
    });
  }
  console.log(`  ✓ ${SLA_POLICIES.length} SLA policies`);
}

async function seedCategories(): Promise<void> {
  let created = 0;
  for (const name of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name } });
    if (!existing) {
      await prisma.category.create({ data: { name } });
      created++;
    }
  }
  console.log(
    `  ✓ ${CATEGORIES.length} categories (${created} created, ${CATEGORIES.length - created} already existed)`,
  );
}

async function seedUsers(roleMap: Record<RoleName, string>): Promise<void> {
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, department: u.department, accountStatus: AccountStatus.ACTIVE },
      create: {
        email: u.email,
        name: u.name,
        department: u.department,
        ssoSubject: `dev|${u.email}`,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    // Replace roles on every run so seed is idempotent
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({
      data: u.roles.map((roleName) => ({
        userId: user.id,
        roleId: roleMap[roleName],
      })),
    });

    const roleLabels = u.roles.join(', ');
    console.log(`    ${u.email.padEnd(26)} [${roleLabels}]`);
  }
  console.log(`  ✓ ${USERS.length} users`);
}

async function seedSystemConfig(): Promise<void> {
  const configs = [
    { key: 'MAX_DEVICES_PER_EMPLOYEE', value: '2' },
    { key: 'REMINDER_CADENCE_DAYS',    value: '3' },
    { key: 'REOPEN_WINDOW_DAYS',       value: '7' },
  ];
  for (const cfg of configs) {
    await prisma.systemConfig.upsert({
      where:  { key: cfg.key },
      update: {},
      create: cfg,
    });
  }
  console.log(`  ✓ ${configs.length} system config entries`);
}

async function main() {
  console.log('🌱 Seeding database…\n');

  const roleMap = await seedRoles();
  await seedCalendar();
  await seedSLAPolicies();
  await seedCategories();
  await seedSystemConfig();

  console.log('  Users:');
  await seedUsers(roleMap);

  console.log('\n✅ Done.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
