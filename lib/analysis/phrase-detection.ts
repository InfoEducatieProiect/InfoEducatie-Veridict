import { calculateCosineSimilarity } from "./similarity"

/**
 * Implements the adaptive-threshold algorithm:
 *
 * - globalCosine >= 50 → strict mode: sentence Jaccard threshold = 0.25
 * - globalCosine 30–49 → dynamic fallback: threshold = 0.12 + word/bigram overlap
 * - below 30 → returns empty (no highlighting)
 */
export function getSimilarPhrases(
  text1: string,
  text2: string,
  globalCosine?: number
): string[] {
  const cosine = globalCosine ?? calculateCosineSimilarity(text1, text2)

  const strictMode = cosine >= 50
  const dynamicMode = cosine >= 30 && cosine < 50

  if (!strictMode && !dynamicMode) return []

  const jaccardThreshold = strictMode ? 0.25 : 0.12
  const wordOverlapThreshold = strictMode ? 0.50 : 0.35

  const splitSentences = (t: string): string[] =>
    t.split(/[.!?;\n]+/).map((s) => s.trim()).filter((s) => s.length > 12)

  const charShingles = (s: string): Set<string> => {
    const clean = s
      .toLowerCase()
      .replace(/[^a-zăâîşţ ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
    const out = new Set<string>()
    for (let i = 0; i <= clean.length - 3; i++) out.add(clean.slice(i, i + 3))
    return out
  }

  const jaccardChar = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0
    let inter = 0
    for (const s of a) if (b.has(s)) inter++
    return inter / (a.size + b.size - inter)
  }

  const contentWordOverlap = (s1: string, s2: string): number => {
    const contentWords = (s: string) =>
      new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
    const w1 = contentWords(s1)
    const w2 = contentWords(s2)
    if (w1.size === 0 || w2.size === 0) return 0
    let inter = 0
    for (const w of w1) if (w2.has(w)) inter++
    return inter / Math.min(w1.size, w2.size)
  }

  const bigramOverlap = (s1: string, s2: string): number => {
    const bigrams = (s: string): Set<string> => {
      const words = s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean)
      const bg = new Set<string>()
      for (let i = 0; i < words.length - 1; i++) bg.add(`${words[i]} ${words[i + 1]}`)
      return bg
    }
    const b1 = bigrams(s1)
    const b2 = bigrams(s2)
    if (b1.size === 0 || b2.size === 0) return 0
    let inter = 0
    for (const b of b1) if (b2.has(b)) inter++
    return inter / Math.min(b1.size, b2.size)
  }

  const sentsT2 = splitSentences(text2)
  const shinglesT2 = sentsT2.map(charShingles)
  const suspicious: string[] = []

  for (const s1 of splitSentences(text1)) {
    const sh1 = charShingles(s1)
    if (sh1.size === 0) continue

    let matched = false
    for (let i = 0; i < sentsT2.length; i++) {
      const jScore = jaccardChar(sh1, shinglesT2[i])

      if (jScore >= jaccardThreshold) {
        matched = true
        break
      }

      if (dynamicMode) {
        const wScore = contentWordOverlap(s1, sentsT2[i])
        const bScore = bigramOverlap(s1, sentsT2[i])
        if (wScore >= wordOverlapThreshold || bScore >= 0.20) {
          matched = true
          break
        }
      }
    }

    if (matched) suspicious.push(s1)
  }

  return suspicious
}

/**
 * Locate character-level [{start, end, severity}] spans for highlighting.
 *
 * severity "yellow" → paraphrased (30–50% global cosine)
 * severity "orange" → similar (50–65%)
 * severity "red"    → near-identical (>65%)
 */
export function spansFromSentences(
  text: string,
  sentences: string[],
  severity: "yellow" | "orange" | "red"
): { start: number; end: number; severity: "yellow" | "orange" | "red" }[] {
  const spans: { start: number; end: number; severity: "yellow" | "orange" | "red" }[] = []
  for (const sent of sentences) {
    if (sent.length < 5) continue
    const escaped = sent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      const regex = new RegExp(escaped, "i")
      const m = regex.exec(text)
      if (m) spans.push({ start: m.index, end: m.index + m[0].length, severity })
    } catch {
      // Skip sentences with regex-breaking characters
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

export function locateMatchingSpans(
  text: string,
  matchingShingles: Set<string>,
  severity: "yellow" | "orange" | "red"
): { start: number; end: number; severity: "yellow" | "orange" | "red" }[] {
  if (matchingShingles.size === 0) return []

  const lower = text.toLowerCase().replace(/[^\w\săîâțș]/gi, " ")
  const spans: { start: number; end: number; severity: "yellow" | "orange" | "red" }[] = []

  for (const shingle of matchingShingles) {
    const shingleWords = shingle.split(" ")
    const pattern = shingleWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")
    const regex = new RegExp(pattern, "gi")
    let m: RegExpExecArray | null
    while ((m = regex.exec(lower)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const existing = spans.find((s) => s.start <= end && s.end >= start)
      if (existing) {
        existing.start = Math.min(existing.start, start)
        existing.end = Math.max(existing.end, end)
      } else {
        spans.push({ start, end, severity })
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}
