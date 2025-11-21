import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesHashHex } from './src/rules-hash';
import { QuestContract } from './src/simulator/contract';
type ProofEnvelope = import('./src/simulator/verifiers').ProofEnvelope;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const quest = JSON.parse(readFileSync(path.join(__dirname, 'vectors/quest.json'), 'utf8'));
const proofs = JSON.parse(readFileSync(path.join(__dirname, 'vectors/proofs.json'), 'utf8'));

const hash = rulesHashHex(quest);
const qc = new QuestContract(quest, hash);
const addr: string = proofs.player;

for (const sub of proofs.submissions as ProofEnvelope[]) {
  if (sub.publicSignals.questHash && String(sub.publicSignals.questHash).startsWith('<0x')) {
    sub.publicSignals.questHash = hash;
  }
  qc.submitProof(addr, sub);
}

qc.settle(addr);
// @ts-ignore
const state = qc.getPlayer(addr);
console.log(JSON.stringify(state, null, 2));
