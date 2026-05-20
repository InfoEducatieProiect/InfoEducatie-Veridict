/**
 * Dynamic confidence gate regression checks (TS parity).
 * Run: npx tsx scripts/test_fusion_agnostic.ts
 */
import { analizeazaTextComplet } from "../lib/hybrid-ai-detection"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const human = analizeazaTextComplet(
  "Da. Trenul a incetinit brusc pe curba ingusta din vale, iar toti pasagerii au privit in tacere " +
    "spre feribotul departat care abia se vedea prin ceata. Nu. Gandi. Soarele cobora.",
  8,
  undefined,
)
console.log(`human: ${human.scor_combinat_ai}%`)
assert(human.scor_combinat_ai <= 19.5, `Human floor expected <=19.5%, got ${human.scor_combinat_ai}`)
assert(human.scor_combinat_ai >= 5.2, `Human floor expected >=5.2%, got ${human.scor_combinat_ai}`)

const highNeural = analizeazaTextComplet(
  "In conclusion, furthermore it is important to note that one of the most essential " +
    "topics plays a crucial role in modern research and provides people with context.",
  95,
  "en",
)
console.log(
  `high_neural_en: ${highNeural.scor_combinat_ai}% w=${highNeural.greutate_roberta}`,
)
assert(
  highNeural.scor_combinat_ai >= 85,
  `Neural veto must breach 85%, got ${highNeural.scor_combinat_ai}`,
)
assert(
  (highNeural.greutate_roberta ?? 0) >= 0.9,
  `Neural weight >=0.9 at 95%, got ${highNeural.greutate_roberta}`,
)

const enMarkers = analizeazaTextComplet(
  "In conclusion trees are one of the most essential for life and play a crucial role.",
  72,
  "en",
)
assert(
  enMarkers.scor_combinat_ai >= 70,
  `EN phrase boost should surface advanced AI, got ${enMarkers.scor_combinat_ai}`,
)

const burstA = analizeazaTextComplet("Short. Medium length sentence here.", 50, "ro")
const burstB = analizeazaTextComplet(
  "Short. Medium length sentence here. Longer sentence with more words and extra clause.",
  50,
  "ro",
)
assert(
  burstA.scor_structura !== burstB.scor_structura,
  "Burst-linear structure must differ between texts",
)

console.log("OK: confidence gate — human floor, neural veto, EN phrase scaling.")
