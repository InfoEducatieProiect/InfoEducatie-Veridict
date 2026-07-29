export function curata_si_sparge(text: string): string[] {
  return text.toLowerCase().match(/\b[a-zăâîșț_]+\b/g) || []
}

export function genereaza_shingles_cuvinte(text: string, k: number = 1): Set<string> {
  const cuvinte = curata_si_sparge(text)
  const shingles = new Set<string>()
  if (cuvinte.length < k) return shingles
  for (let i = 0; i <= cuvinte.length - k; i++) {
    shingles.add(cuvinte.slice(i, i + k).join(" "))
  }
  return shingles
}

export function genereaza_shingles(text: string, k = 4): Set<string> {
  const text_curat = curata_si_sparge(text).join("")
  const shingles = new Set<string>()
  if (text_curat.length < k) return shingles
  for (let i = 0; i <= text_curat.length - k; i++) {
    shingles.add(text_curat.substring(i, i + k))
  }
  return shingles
}

export function calculeaza_jaccard(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0
  const intersectie = new Set([...set1].filter((x) => set2.has(x)))
  const uniune = new Set([...set1, ...set2])
  return intersectie.size / uniune.size
}

export function extrage_propozitii(text: string): string[] {
  return text.split(/[.!?;\n]+/).map((p) => p.trim()).filter((p) => p.length > 15)
}

export function gaseste_fraze_similare_ideatic(
  text1: string,
  text2: string,
  prag_fraza = 0.25
): string[] {
  const propozitii_t2 = extrage_propozitii(text2)
  const shingles_t2 = propozitii_t2.map((p) => genereaza_shingles(p))

  const fraze_suspecte: string[] = []
  for (const p1 of extrage_propozitii(text1)) {
    const s1 = genereaza_shingles(p1)
    if (s1.size === 0) continue
    for (const s2 of shingles_t2) {
      if (calculeaza_jaccard(s1, s2) >= prag_fraza) {
        fraze_suspecte.push(p1)
        break
      }
    }
  }
  return fraze_suspecte
}
