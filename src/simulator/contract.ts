import type { ProofEnvelope } from './verifiers';
import { verifyProof } from './verifiers';

export type PlayerState = {
  joined: boolean;
  stakeADA: number;
  windowsMet: number;
  windowsTotal: number;
  completionPct: number;
  eligibleToSettle: boolean;
  settled: boolean;
  claimableRewards: Record<string, number>;
  events: string[];
};

export class QuestContract {
  rules: any;
  rulesHash: string;
  payoutMode: 'PPC' | 'AON' | 'TOURNAMENT';
  private nullifiers = new Set<string>();
  private players = new Map<string, PlayerState>();

  constructor(rules: any, rulesHash: string) {
    this.rules = rules;
    this.rulesHash = rulesHash;
    this.payoutMode = rules?.economics?.payoutMode ?? 'PPC';
  }

  getPlayer(addr: string): PlayerState {
    if (!this.players.has(addr)) {
      const total = this._calcWindowsTotal();
      this.players.set(addr, {
        joined: true,
        stakeADA: 50,
        windowsMet: 0,
        windowsTotal: total,
        completionPct: 0,
        eligibleToSettle: false,
        settled: false,
        claimableRewards: {},
        events: []
      });
    }
    return this.players.get(addr)!;
  }

  submitProof(addr: string, env: ProofEnvelope) {
    if (!verifyProof(env)) throw new Error('VERIFICATION_FAILED');
    if (env.publicSignals.questHash !== this.rulesHash) {
      throw new Error('RULES_MISMATCH');
    }

    for (const n of env.nullifiers ?? []) {
      if (this.nullifiers.has(n)) throw new Error('NULLIFIER_REUSED');
      this.nullifiers.add(n);
    }

    const p = this.getPlayer(addr);

    switch (env.circuitId) {
      case 'count-threshold-v1': {
        if (Number(env.publicSignals.met) === 1) {
          p.windowsMet += 1;
          p.events.push(`MilestoneMet[${env.publicSignals.windowIndex}]`);
        } else {
          p.events.push(`MilestoneMissed[${env.publicSignals.windowIndex}]`);
        }
        p.completionPct = p.windowsTotal === 0 ? 0 : p.windowsMet / p.windowsTotal;
        break;
      }
      case 'deadline-v1': {
        if (Number(env.publicSignals.ok) !== 1) {
          throw new Error('DEADLINE_NOT_MET');
        }
        p.events.push('DeadlineOk');
        break;
      }
      case 'oracle-fact-v1': {
        if (Number(env.publicSignals.ok) !== 1) {
          throw new Error('ORACLE_FACT_NOT_MET');
        }
        p.events.push('OracleOk');
        break;
      }
      case 'team-quorum-v1': {
        if (Number(env.publicSignals.ok) !== 1) {
          throw new Error('TEAM_QUORUM_NOT_MET');
        }
        p.events.push(`TeamQuorumOk[${env.publicSignals.quorumPct}%]`);
        break;
      }
      case 'streak-v1': {
        if (Number(env.publicSignals.streakOk) !== 1) {
          throw new Error('STREAK_NOT_MET');
        }
        p.windowsMet += 1;
        p.completionPct = p.windowsTotal === 0 ? 0 : p.windowsMet / p.windowsTotal;
        p.events.push(`StreakOk[${env.publicSignals.windowIndex}]`);
        break;
      }
      default:
        throw new Error('UNKNOWN_CIRCUIT');
    }
  }

  settle(addr: string) {
    const p = this.getPlayer(addr);
    const minPct =
      Number(this.rules?.settlement?.successCriteria?.minWindowsCompletedPct ?? 100) / 100;
    p.eligibleToSettle = p.completionPct >= minPct;
    p.settled = true;

    const rewardPool = Number(this.rules?.economics?.rewardPool?.amount ?? 0);
    const cw = Number(this.rules?.economics?.payoutWeights?.completionWeight ?? 1);
    const rw = Number(this.rules?.economics?.payoutWeights?.reputationWeight ?? 0);
    const repFactor = 0.05;

    const rep = rewardPool * rw * repFactor;

    let pactReward = 0;
    if (this.payoutMode === 'AON') {
      pactReward = p.eligibleToSettle
        ? Math.round((rewardPool * cw + rep) * 100) / 100
        : 0;
    } else if (this.payoutMode === 'TOURNAMENT') {
      const entrants = Number(this.rules?.economics?.tournament?.entrants ?? 1);
      const culled = Number(this.rules?.economics?.tournament?.culledCount ?? 0);
      const survivors = Math.max(1, entrants - culled);
      const perSurvivor = (rewardPool * cw) / survivors;
      pactReward = p.eligibleToSettle
        ? Math.round((perSurvivor * p.completionPct + rep) * 100) / 100
        : 0;
    } else {
      const base = rewardPool * cw * p.completionPct;
      pactReward = Math.round((base + rep) * 100) / 100;
    }

    p.claimableRewards = {
      PACT: pactReward,
      ADAStakeReturn: p.eligibleToSettle ? p.stakeADA : 0
    };
  }

  private _calcWindowsTotal(): number {
    const mf = this.rules?.time?.milestoneFrequency;
    if (!mf?.windowDays) return 0;
    const start = Date.parse(this.rules?.time?.start);
    const end = Date.parse(this.rules?.time?.end);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return Math.ceil(days / mf.windowDays);
  }
}
