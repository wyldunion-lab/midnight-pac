export type PublicSignals = Record<string, any>;

export interface ProofEnvelope {
  circuitId: string;
  vkId: string;
  proof: string;
  publicSignals: PublicSignals;
  nullifiers?: string[];
  merkleRoots?: string[];
  nonce?: string;
  timestampHint?: number;
}

export function verifyProof(env: ProofEnvelope): boolean {
  const { circuitId, publicSignals } = env;
  switch (circuitId) {
    case 'count-threshold-v1': {
      const met = Number(publicSignals?.met ?? 0);
      const target = Number(publicSignals?.target ?? 0);
      const windowIndex = Number(publicSignals?.windowIndex ?? -1);
      return (met === 0 || met === 1) && target >= 1 && windowIndex >= 0;
    }
    case 'deadline-v1': {
      const ok = Number(publicSignals?.ok ?? 0);
      const sub = Number(publicSignals?.submissionEpoch ?? 0);
      const dl = Number(publicSignals?.deadlineEpoch ?? 0);
      return (ok === 1 && sub <= dl) || ok === 0;
    }
    case 'oracle-fact-v1': {
      const ok = Number(publicSignals?.ok ?? 0);
      return ok === 1 || ok === 0;
    }
    case 'team-quorum-v1': {
      const ok = Number(publicSignals?.ok ?? 0);
      const qp = Number(publicSignals?.quorumPct ?? 0);
      return (ok === 0 || ok === 1) && qp >= 1 && qp <= 100;
    }
    case 'streak-v1': {
      const sOk = Number(publicSignals?.streakOk ?? 0);
      const required = Number(publicSignals?.required ?? 0);
      const wi = Number(publicSignals?.windowIndex ?? -1);
      return (sOk === 0 || sOk === 1) && required >= 1 && wi >= 0;
    }
    default:
      return false;
  }
}
