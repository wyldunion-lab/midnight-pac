import { readFileSync } from 'node:fs';
import { rulesHashHex, canonicalize } from '../src/rules-hash';

const questPath = new URL('../vectors/quest.json', import.meta.url);
const quest = JSON.parse(readFileSync(questPath, 'utf8'));

const canon = canonicalize(quest);
const hash = rulesHashHex(quest);

console.log('Canonical JSON:\n', canon);
console.log('\nRules Hash:', hash);
