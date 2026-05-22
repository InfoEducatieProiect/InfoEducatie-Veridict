export interface StylometryMetrics {
  ttr: number
  asl: number
  verbs: number
  adjs: number
  punct: number
}

export interface StylometryVerdict {
  label: string
  emoji: string
  color: string
  bg: string
  message: string
}

export function buildStylometryVerdict(deviation: number): StylometryVerdict {
  if (deviation < 22) {
    return {
      label: "Stil Autentic",
      emoji: "✅",
      color: "#10B981",
      bg: "rgba(16,185,129,0.12)",
      message:
        "Fluctuație naturală umană. Elevul a folosit o topică ușor diferită sau textul are altă lungime, dar tiparul structural de bază rămâne neschimbat.",
    }
  }
  if (deviation < 38) {
    return {
      label: "Modificare Stilistică",
      emoji: "⚠️",
      color: "#F97316",
      bg: "rgba(249,115,22,0.12)",
      message:
        "Zonă gri. Schimbare vizibilă de vocabular sau structură a frazei. Poate indica ajutor extern, copiere parțială sau traducere din altă limbă.",
    }
  }
  return {
    label: "Alertă Fraudă",
    emoji: "❌",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.12)",
    message:
      "Abatere structurală majoră. Este aproape imposibil ca același elev să își schimbe simultan densitatea de verbe, adjective, punctuație și lungimea frazelor cu peste 38%. Text probabil generat de AI sau copiat integral.",
  }
}
