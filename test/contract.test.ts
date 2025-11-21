import { describe, expect, it } from 'vitest';
import { QuestContract } from '../src/simulator/contract';
import { rulesHashHex } from '../src/rules-hash';
import type { ProofEnvelope } from '../src/simulator/verifiers';

function makeRules(overrides: any = {}) {
  return {
    name: 'Quest',
    time: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-02-01T00:00:00Z',
      milestoneFrequency: { windowDays: 7 }
    },
    settlement: { successCriteria: { minWindowsCompletedPct: 60 } },
    economics: {
      payoutMode: 'PPC',
      rewardPool: { amount: 1000, asset: 'PACT' },
      payoutWeights: { completionWeight: 0.8, reputationWeight: 0.2 },
      tournament: { entrants: 10, culledCount: 4 },
      ...overrides.economics
    },
    ...overrides
  };
}

describe('QuestContract settlement and guards', () => {
  it('tracks PPC window progress and payouts', () => {
    const rules = makeRules();
    const qc = new QuestContract(rules, rulesHashHex(rules));
    const addr = 'addr1';

    const submissions: ProofEnvelope[] = [
      {
        circuitId: 'count-threshold-v1',
        vkId: 'vk-count',
        proof: '0x01',
        publicSignals: {
          met: 1,
          target: 1,
          windowIndex: 0,
          questHash: qc.rulesHash
        },
        nullifiers: ['null-0']
      },
      {
        circuitId: 'count-threshold-v1',
        vkId: 'vk-count',
        proof: '0x02',
        publicSignals: {
          met: 1,
          target: 1,
          windowIndex: 1,
          questHash: qc.rulesHash
        },
        nullifiers: ['null-1']
      },
      {
        circuitId: 'count-threshold-v1',
        vkId: 'vk-count',
        proof: '0x03',
        publicSignals: {
          met: 0,
          target: 1,
          windowIndex: 2,
          questHash: qc.rulesHash
        },
        nullifiers: ['null-2']
      }
    ];

    submissions.forEach((p) => qc.submitProof(addr, p));
    qc.settle(addr);
    const state = qc.getPlayer(addr);

    expect(state.windowsMet).toBe(2);
    expect(state.windowsTotal).toBe(5);
    expect(state.completionPct).toBeCloseTo(0.4);
    expect(state.events).toEqual([
      'MilestoneMet[0]',
      'MilestoneMet[1]',
      'MilestoneMissed[2]'
    ]);
    expect(state.claimableRewards.PACT).toBe(330);
    expect(state.claimableRewards.ADAStakeReturn).toBe(0);
    expect(state.eligibleToSettle).toBe(false);
  });

  it('rejects mismatched quest hashes, reused nullifiers, and failed verification', () => {
    const rules = makeRules();
    const qc = new QuestContract(rules, rulesHashHex(rules));
    const addr = 'addr1';

    const badQuest: ProofEnvelope = {
      circuitId: 'count-threshold-v1',
      vkId: 'vk-count',
      proof: '0x01',
      publicSignals: { met: 1, target: 1, windowIndex: 0, questHash: '0xbad' },
      nullifiers: ['null-0']
    };

    expect(() => qc.submitProof(addr, badQuest)).toThrowError('RULES_MISMATCH');

    const goodQuest: ProofEnvelope = {
      ...badQuest,
      publicSignals: { ...badQuest.publicSignals, questHash: qc.rulesHash },
      nullifiers: ['null-unique']
    };
    qc.submitProof(addr, goodQuest);
    expect(() => qc.submitProof(addr, { ...goodQuest })).toThrowError('NULLIFIER_REUSED');

    const badVerification: ProofEnvelope = {
      circuitId: 'deadline-v1',
      vkId: 'vk-deadline',
      proof: '0x02',
      publicSignals: { ok: 1, submissionEpoch: 2, deadlineEpoch: 1, questHash: qc.rulesHash }
    };
    expect(() => qc.submitProof(addr, badVerification)).toThrowError('VERIFICATION_FAILED');
  });

  it('enforces all-or-nothing settlement thresholds', () => {
    const rules = makeRules({
      economics: {
        payoutMode: 'AON',
        rewardPool: { amount: 500, asset: 'PACT' },
        payoutWeights: { completionWeight: 1, reputationWeight: 0 }
      },
      settlement: { successCriteria: { minWindowsCompletedPct: 75 } }
    });
    const qc = new QuestContract(rules, rulesHashHex(rules));
    const addr = 'addr-aon';

    const proofs: ProofEnvelope[] = [
      {
        circuitId: 'count-threshold-v1',
        vkId: 'vk-count',
        proof: '0x10',
        publicSignals: { met: 1, target: 1, windowIndex: 0, questHash: qc.rulesHash },
        nullifiers: ['aon-0']
      },
      {
        circuitId: 'count-threshold-v1',
        vkId: 'vk-count',
        proof: '0x11',
        publicSignals: { met: 1, target: 1, windowIndex: 1, questHash: qc.rulesHash },
        nullifiers: ['aon-1']
      }
    ];

    proofs.forEach((p) => qc.submitProof(addr, p));
    qc.settle(addr);
    const state = qc.getPlayer(addr);

    expect(state.completionPct).toBeCloseTo(0.4);
    expect(state.eligibleToSettle).toBe(false);
    expect(state.claimableRewards).toEqual({ PACT: 0, ADAStakeReturn: 0 });
  });

  it('calculates tournament payouts using culled player counts', () => {
    const rules = makeRules({
      economics: {
        payoutMode: 'TOURNAMENT',
        rewardPool: { amount: 900, asset: 'PACT' },
        payoutWeights: { completionWeight: 1, reputationWeight: 0.1 },
        tournament: { entrants: 10, culledCount: 4 }
      },
      settlement: { successCriteria: { minWindowsCompletedPct: 50 } },
      time: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-22T00:00:00Z',
        milestoneFrequency: { windowDays: 7 }
      }
    });
    const qc = new QuestContract(rules, rulesHashHex(rules));
    const addr = 'addr-tourney';

    const proofs: ProofEnvelope[] = [0, 1, 2].map((windowIndex) => ({
      circuitId: 'count-threshold-v1',
      vkId: 'vk-count',
      proof: `0x${windowIndex}`,
      publicSignals: { met: 1, target: 1, windowIndex, questHash: qc.rulesHash },
      nullifiers: [`tourney-${windowIndex}`]
    }));

    proofs.forEach((p) => qc.submitProof(addr, p));
    qc.settle(addr);
    const state = qc.getPlayer(addr);

    expect(state.windowsTotal).toBe(3);
    expect(state.completionPct).toBe(1);
    expect(state.eligibleToSettle).toBe(true);
    expect(state.claimableRewards.PACT).toBeCloseTo(154.5);
    expect(state.claimableRewards.ADAStakeReturn).toBe(50);
  });
});
