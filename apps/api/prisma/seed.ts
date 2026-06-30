import { AccountStatus, PrismaClient, Priority, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12; // matches AuthService

/** Strong, url-safe random password (~140 bits entropy). Never hardcoded or persisted in plaintext. */
function generateStrongPassword(): string {
  return randomBytes(18).toString('base64url');
}

// ─── Seed data ────────────────────────────────────────────────────────────────

// `bootstrap` → real email/password SYS_ADMIN whose password is GENERATED at seed time,
//   printed once to the console, and stored only as a bcrypt hash (never in a file/AuditLog).
// `password` set → real email/password account with a fixed password (bcrypt-hashed).
// Neither → dev-login / OIDC account (ssoSubject set, no passwordHash).
const USERS: Array<{
  email: string;
  name: string;
  department: string;
  roles: RoleName[];
  password?: string;
  bootstrap?: boolean;
}> = [
  {
    // Bootstrap SYS_ADMIN — password generated + printed once during seeding.
    email: 'admin@ticketzilla.dev',
    name: 'TicketZilla Admin',
    department: 'IT',
    roles: [RoleName.SYS_ADMIN],
    bootstrap: true,
  },
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

/** Returns the generated bootstrap credential to print once, or null if already provisioned. */
async function seedUsers(
  roleMap: Record<RoleName, string>,
): Promise<{ email: string; password: string } | null> {
  let bootstrapCredential: { email: string; password: string } | null = null;

  for (const u of USERS) {
    let passwordHash: string | null = null;
    let kind = 'dev-login';

    if (u.bootstrap) {
      // Generate a password only on FIRST provision so re-seeding never rotates (or prints) it.
      const existing = await prisma.user.findUnique({
        where: { email: u.email },
        select: { passwordHash: true },
      });
      if (existing?.passwordHash) {
        kind = 'bootstrap (already set)';
      } else {
        const generated = generateStrongPassword();
        passwordHash = await bcrypt.hash(generated, BCRYPT_ROUNDS);
        bootstrapCredential = { email: u.email, password: generated };
        kind = 'bootstrap (generated)';
      }
    } else if (u.password) {
      passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
      kind = 'password';
    }

    const isCredential = !!u.password || !!u.bootstrap;

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        department: u.department,
        accountStatus: AccountStatus.ACTIVE,
        // Only write a hash when we actually have one (don't clobber an existing bootstrap password).
        ...(passwordHash && { passwordHash }),
      },
      create: {
        email: u.email,
        name: u.name,
        department: u.department,
        // Credentialed accounts have no SSO subject; dev-login accounts have no password.
        ssoSubject: isCredential ? null : `dev|${u.email}`,
        passwordHash,
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

    console.log(`    ${u.email.padEnd(26)} [${u.roles.join(', ')}] (${kind})`);
  }
  console.log(`  ✓ ${USERS.length} users`);
  return bootstrapCredential;
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
  const bootstrap = await seedUsers(roleMap);

  console.log('\n✅ Done.');

  // Print the bootstrap SYS_ADMIN password ONCE. It is stored only as a bcrypt hash —
  // not in any file or AuditLog — so this console output is the only place it ever appears.
  if (bootstrap) {
    const line = '═'.repeat(64);
    console.log(`\n${line}`);
    console.log('  BOOTSTRAP SYS_ADMIN CREDENTIALS — shown once, SAVE THIS NOW');
    console.log(`${line}`);
    console.log(`  email:    ${bootstrap.email}`);
    console.log(`  password: ${bootstrap.password}`);
    console.log(`${line}`);
    console.log('  This password is NOT stored anywhere except as a bcrypt hash.');
    console.log('  Re-running the seed will NOT reprint or change it.');
    console.log(`${line}\n`);
  } else if (USERS.some((u) => u.bootstrap)) {
    console.log('\n  ℹ Bootstrap SYS_ADMIN already provisioned — password unchanged (not shown).');
    console.log('    Reset the DB or clear its passwordHash to generate a new one.\n');
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
