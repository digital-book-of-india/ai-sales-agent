import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!';

const DEMO_USERS = [
  {
    name: 'Admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    role: Role.ADMIN,
  },
  {
    name: 'Sales Manager',
    email: process.env.SEED_MANAGER_EMAIL ?? 'manager@example.com',
    role: Role.SALES_MANAGER,
  },
  {
    name: 'Sales Executive',
    email: process.env.SEED_EXECUTIVE_EMAIL ?? 'executive@example.com',
    role: Role.SALES_EXECUTIVE,
    // Matches the example softphone in
    // infra/asterisk/etc/asterisk/pjsip.internal.conf.example, so a MANUAL
    // call (SipTelephonyProvider/AsteriskProvider) has somewhere real to
    // bridge to out of the box.
    sipExtension: '1001',
    // Must match extension 1001's password in pjsip.internal.conf on the
    // PBX server — see pjsip.internal.conf.example's REPLACE_WITH_A_STRONG_PASSWORD.
    sipPassword: process.env.SEED_SIP_PASSWORD ?? 'demo-sip-secret-1001',
  },
];

// Prompt 15 — Pipeline board columns, left to right.
const PIPELINE_STAGES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'QUALIFIED',
  'DEMO',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        sipExtension: user.sipExtension,
        sipPassword: user.sipPassword,
      },
    });
    console.log(`${user.role} user ready: ${user.email} / ${DEMO_PASSWORD}`);
  }

  for (const [order, name] of PIPELINE_STAGES.entries()) {
    await prisma.pipelineStage.upsert({
      where: { name },
      update: { order },
      create: { name, order },
    });
  }
  console.log(`${PIPELINE_STAGES.length} pipeline stages ready`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
