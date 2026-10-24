import { createPublicKey } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const keys = JSON.parse(process.env.PULSE_RELEASE_PUBLIC_KEYS || '[]');
if (!Array.isArray(keys) || !keys.length || keys.length > 5) throw new Error('Configure PULSE_RELEASE_PUBLIC_KEYS with the active Ed25519 public keys.');
for (const key of keys) if (typeof key !== 'string' || createPublicKey(key).asymmetricKeyType !== 'ed25519') throw new Error('Only Ed25519 public verification keys are accepted.');
writeFileSync('services/updater/trusted-keys.json',JSON.stringify(keys,null,2)+'\n');
