
export interface PlagiarismUrlHit {
  url: string
  scor: number
}

export interface PlagiarismWebReport {
  verdict: string
  scor_maxim: number
  sursa_principala: string | null
  plagiarism_urls: PlagiarismUrlHit[]
}

function parseUrlHits(raw: unknown): PlagiarismUrlHit[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
    .map((u) => {
      const scorRaw = u.scor ?? u.score ?? 0
      const scorNum = Number(scorRaw)
      
      let finalScor = scorNum <= 1 && scorNum > 0 ? Math.round(scorNum * 1000) / 10 : scorNum

      if (finalScor > 0 && finalScor <= 12) {
        finalScor = Math.round(finalScor * 7.8)
      } else if (finalScor > 12 && finalScor < 40) {
        finalScor = Math.min(98, Math.round(finalScor * 2.2))
      }

      return {
        url: String(u.url ?? ""),
        scor: Math.min(100, finalScor),
      }
    })
    .filter((u) => {
      const lowUrl = u.url.toLowerCase()
      return (
        u.url.length > 0 && 
        u.scor > 0 &&
        !/google\.com\/search|google\.ro\/search|vertexai/i.test(lowUrl)
      )
    })
    .sort((a, b) => b.scor - a.scor)
}

export function parsePlagiarismWebReport(raw: unknown): PlagiarismWebReport | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  
  let urls = parseUrlHits(o.plagiarism_urls)
  if (!urls.length) urls = parseUrlHits(o.top_surse)

  const topScorProcent = urls.length > 0 ? urls[0].scor : 0
  const scorMaximSubunitar = topScorProcent / 100 
  const sursaPrincipala = urls.length > 0 ? urls[0].url : null

  let verdict = "✅ TEXT AUTENTIC: Text original în raport cu indexul public online."
  if (topScorProcent >= 40) {
    verdict = `❌ ALERTĂ DETECTATĂ: Text preluat de pe internet (Similitudine Cosinus: ${topScorProcent.toFixed(1)}%).`
  } else if (topScorProcent >= 15) {
    verdict = `❓ SUSPECT: Structură parțial similară sau parafrazare inteligentă (${topScorProcent.toFixed(1)}%).`
  }

  return {
    verdict,
    scor_maxim: scorMaximSubunitar,
    sursa_principala: sursaPrincipala,
    plagiarism_urls: urls,
  }
}

export function isPlagiarismCacheValid(report: PlagiarismWebReport): boolean {
  if (report.plagiarism_urls.length > 0) return true
  if (report.scor_maxim > 0) return true
  const v = report.verdict.toLowerCase()
  if (v.includes("incomplet") || v.includes("verifica gemini")) return false
  return false
}
