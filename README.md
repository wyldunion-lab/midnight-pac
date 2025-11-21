# Midnight Accountability Blueprint

A minimal, testable scaffold for a privacy-first accountability dApp on **Midnight** (Cardano sidechain).

Includes:
- Deterministic **rules hash** canonicalizer (TypeScript + BLAKE2b-256)
- Contract simulator with nullifier registry and proof routing
- Mock verifiers for MVP circuits (non-cryptographic)
- Test vectors (quests, proofs, expected state)
- Vitest unit + e2e tests
- State machine diagrams (Mermaid + SVG)

## Quick start

```bash
npm install
npm run test:all
npm run cli
npx tsx scripts/hash-quest.ts
```
