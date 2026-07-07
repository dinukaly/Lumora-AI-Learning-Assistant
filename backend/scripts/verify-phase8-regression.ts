import { spawnSync } from 'node:child_process';

type VerificationStep = {
  command: string;
  label: string;
};

const verificationSteps: VerificationStep[] = [
  { label: 'T8.3 auth data model, local auth, profile, password', command: 'npm run verify:t83' },
  { label: 'T8.4 refresh-session rotation and reuse detection', command: 'npm run verify:t84' },
  { label: 'T8.5 email verification backend', command: 'npm run verify:t85' },
  { label: 'T8.6 unverified-account protected-route gate', command: 'npm run verify:t86' },
  { label: 'T8.7 login lockout and throttling', command: 'npm run verify:t87' },
  { label: 'T8.8 Google OAuth and safe account linking', command: 'npm run verify:t88' },
  { label: 'T8.2a profile avatar upload', command: 'npx tsx scripts/verify-avatar-upload.ts' },
  { label: 'T4.4 document-grounded AI chat', command: 'npm run verify:t44' },
  { label: 'T4.6 AI actions', command: 'npx tsx scripts/verify-ai-actions.ts' },
  { label: 'T4.7 AI action persistence', command: 'npx tsx scripts/verify-ai-action-persistence.ts' },
  { label: 'T4.9 concept deep dive', command: 'npx tsx scripts/verify-ai-concept-deep-dive.ts' },
  { label: 'T5.1 flashcards', command: 'npm run verify:t51' },
  { label: 'T5.3 quizzes', command: 'npm run verify:t53' },
  { label: 'T6.2 notifications and realtime delivery', command: 'npx tsx scripts/verify-notifications.ts' },
  { label: 'T7.1 admin users and disable protection', command: 'npx tsx scripts/verify-admin-users.ts' },
  { label: 'T7.2 admin documents and jobs', command: 'npx tsx scripts/verify-admin-documents-jobs.ts' },
  { label: 'T7.3 admin analytics', command: 'npx tsx scripts/verify-admin-analytics.ts' },
  { label: 'T7.4 admin notification broadcast', command: 'npx tsx scripts/verify-admin-broadcast.ts' },
];

async function main() {
  const failures: string[] = [];

  for (const [index, step] of verificationSteps.entries()) {
    const prefix = `[${index + 1}/${verificationSteps.length}]`;
    let passed = false;
    let exitCode: number | string = 'unknown';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const retryLabel = attempt === 1 ? '' : ' (retry)';
      console.log(`\n${prefix} ${step.label}${retryLabel}`);
      console.log(`$ ${step.command}`);

      const result = spawnSync(step.command, {
        env: {
          ...process.env,
          CHAT_PROVIDER: process.env.CHAT_PROVIDER ?? 'mock',
          EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER ?? 'mock',
        },
        shell: true,
        stdio: 'inherit',
        windowsHide: true,
      });

      exitCode = result.status ?? 'unknown';
      if (result.status === 0) {
        passed = true;
        break;
      }
    }

    if (!passed) {
      failures.push(`${step.label} failed with exit code ${exitCode}`);
      break;
    }
  }

  if (failures.length > 0) {
    console.error('\nPhase 8 regression verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nPhase 8 regression verification passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
