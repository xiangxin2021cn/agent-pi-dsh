import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { clientSource } from './client-source.ts'

const here = dirname(fileURLToPath(import.meta.url))
const client = clientSource
const onboarding = readFileSync(
  join(here, '../../../vendor/deepseek-harness/packages/client/ui-settings-models/src/client/DeepSeekOnboardingDialog.tsx'),
  'utf8',
)
const registration = readFileSync(
  join(here, '../../../vendor/deepseek-harness/packages/client/ui-settings-models/src/client/index.ts'),
  'utf8',
)

test('tender web does not own model credentials or a first-run API key overlay', () => {
  assert.doesNotMatch(client, /DeepSeekKeyDialog/)
  assert.doesNotMatch(client, /agent-pi-deepseek-key/)
  assert.doesNotMatch(client, /ap-deepseek-key-later/)
  assert.doesNotMatch(client, /credentials\.describe/)
  assert.doesNotMatch(client, /credentials\.set/)
})

test('DSH Models onboarding is the single credential owner', () => {
  assert.match(registration, /settings\.onboarding/)
  assert.match(onboarding, /onboardingReadiness\(state\)/)
  assert.match(onboarding, /readiness\.kind === 'provider-ready'/)
  assert.match(onboarding, /ProviderEditor/)
})
