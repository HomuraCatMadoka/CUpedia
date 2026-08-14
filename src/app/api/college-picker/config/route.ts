import { ok } from "@/lib/cli-api/respond";
import {
  MAJOR_GROUPS,
  SCORED_FACTORS,
  AVOID_FACTORS,
  BONUS_FACTORS,
} from "@/lib/college-picker/data";

/**
 * GET /api/college-picker/config
 *
 * Static option lists for the College Picker form, straight from the data
 * layer. Shapes are the actual exported types:
 *   - majors:        MajorGroupOption[]  ({ id, nameZh, notes })
 *   - scoredFactors: FactorOption[]      ({ id, nameZh })
 *   - avoidFactors:  FactorOption[]      ({ id, nameZh })
 *   - bonusFactors:  FactorOption[]      ({ id, nameZh })
 */
export async function GET() {
  return ok({
    majors: MAJOR_GROUPS,
    scoredFactors: SCORED_FACTORS,
    avoidFactors: AVOID_FACTORS,
    bonusFactors: BONUS_FACTORS,
  });
}
