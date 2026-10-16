// Dev/testing helper only — not part of the app's runtime code path.
//
// TELEPHONY_PROVIDER=mock (the local default) simulates ring/connect/
// complete but never runs the real AI voice pipeline, so a mock call never
// gets a Transcript — and CallAnalysisService.analyze() is a no-op without
// one. This script seeds a sample Hindi/English sales conversation onto an
// existing call so you can see the AI Analysis panel, lead score badge, and
// activity timeline working end-to-end without a real Asterisk/Sarvam call.
//
// Usage:
//   1. Make a normal call from the UI (click-to-call on a lead) and let the
//      mock provider complete it — check Live Calls / the lead's Calls list
//      for its status.
//   2. Copy that call's id from the Call Detail page URL (/calls/<id>).
//   3. npm run seed:transcript -- <callId>
//   4. POST /calling/analysis/by-call/<callId>/reanalyze (ADMIN/SALES_MANAGER
//      token — e.g. via curl/Postman) to run the analysis immediately
//      instead of waiting for the queue.
//   5. Refresh the Call Detail and Lead Detail pages in the browser.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { TranscriptSpeaker } from '../generated/prisma/enums';

const SAMPLE_CONVERSATION: { speaker: TranscriptSpeaker; text: string }[] = [
  {
    speaker: 'AI',
    text: 'Hi, this is Riya calling from Acme Software. Am I speaking with you at a good time?',
  },
  { speaker: 'CUSTOMER', text: 'Haan, bolo, thoda time hai.' },
  {
    speaker: 'AI',
    text: 'Great! We help sales teams automate their calling and lead tracking. Can I ask what CRM or process you use today?',
  },
  {
    speaker: 'CUSTOMER',
    text: 'Abhi hum Excel pe track karte hain, but our team of 20 people is growing and it is getting messy. We need a proper CRM.',
  },
  {
    speaker: 'AI',
    text: 'Got it, so a CRM for a 20-person sales team. Do you have a budget range in mind for this?',
  },
  {
    speaker: 'CUSTOMER',
    text: 'Kuch specific nahi socha, but around 5 lakh sounds reasonable for the year.',
  },
  {
    speaker: 'AI',
    text: 'Perfect, and when are you looking to get this up and running?',
  },
  {
    speaker: 'CUSTOMER',
    text: 'Next quarter tak chahiye, hum expansion kar rahe hain.',
  },
  {
    speaker: 'AI',
    text: 'That works well with our onboarding timeline. Would you like to see a live demo of the platform?',
  },
  {
    speaker: 'CUSTOMER',
    text: 'Haan bilkul, demo dikha do, and I am the one who will approve this purchase.',
  },
  {
    speaker: 'AI',
    text: 'Wonderful — I will get a demo scheduled and send over a pricing sheet as well. Thanks for your time today!',
  },
  { speaker: 'CUSTOMER', text: 'Sure, thank you, talk soon.' },
];

async function main() {
  const callId = process.argv[2];
  if (!callId) {
    console.error('Usage: npm run seed:transcript -- <callId>');
    process.exitCode = 1;
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) {
      console.error(`No call found with id ${callId}`);
      process.exitCode = 1;
      return;
    }

    const transcript = await prisma.transcript.upsert({
      where: { callId },
      create: { callId, finalizedAt: new Date() },
      update: { finalizedAt: new Date() },
    });

    // Wipe any messages from a previous seed run so re-running this script
    // on the same call doesn't duplicate the conversation.
    await prisma.transcriptMessage.deleteMany({
      where: { transcriptId: transcript.id },
    });

    let timestamp = Date.now();
    for (const message of SAMPLE_CONVERSATION) {
      await prisma.transcriptMessage.create({
        data: {
          transcriptId: transcript.id,
          speaker: message.speaker,
          text: message.text,
          timestamp: new Date(timestamp),
        },
      });
      timestamp += 4000;
    }

    console.log(
      `Seeded ${SAMPLE_CONVERSATION.length} transcript messages for call ${callId}.`,
    );
    console.log(
      `Now POST /calling/analysis/by-call/${callId}/reanalyze (ADMIN/SALES_MANAGER token) to run the analysis immediately.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
