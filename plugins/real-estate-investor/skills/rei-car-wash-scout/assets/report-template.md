# Car Wash Site Scout Report

**Target Area:** [State/City/Radius]
**Date:** [Date]

## Phase 1: Demographic Gatekeeper Results

The following cities meet the strict demographic thresholds (Population $\ge$ 30,000 AND Median Household Income $\ge$ $50,000):

| City Name | County | Population | Median HH Income | Source / Vintage |
| :--- | :--- | :--- | :--- | :--- |
| [City 1] | [County] | [Pop] | $[Income] | [Source Link] (ACS [Years]) |
| [City 2] | [County] | [Pop] | $[Income] | [Source Link] (ACS [Years]) |

*Note: Cities failing either criterion have been excluded.*

## Site Criteria Evaluation

The following properties were evaluated against the creative-finance / zero-down site criteria:

| Address | Price | Lot Size | Zoning | Frontage | AADT | Score | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [Address 1] | $[Price] | [Size] ac | [Zoning] | [Frontage] ft | [AADT] | 🟢 PASS | [Notes] |
| [Address 2] | $[Price] | [Size] ac | [Zoning] | [Frontage] ft | [AADT] | 🟡 BORDERLINE | [Notes] |
| [Address 3] | $[Price] | [Size] ac | [Zoning] | [Frontage] ft | [AADT] | 🔴 FAIL | [Notes] |

### Scoring Legend:
- 🟢 **PASS**: Meets all criteria perfectly (Price $\le$ $1M, Zoned by right, Frontage $\ge$ 65ft, AADT $\ge$ 12k, Size 1.5-2ac).
- 🟡 **BORDERLINE**: Close to thresholds (e.g., Price $1M-$1.1M, AADT near 12k).
- 🔴 **FAIL**: Fails one or more hard disqualifiers (e.g., Price > $1.1M, requires rezoning).

## Map Visualization

An interactive map of these properties has been generated.
**Map File:** `[Path to generated HTML map]`

*Green markers indicate passing sites, orange indicate borderline sites, and red indicate failed sites.*

## Next Steps

For each 🟢 green site:
1. Obtain the local **zoning ordinance** and confirm a car wash is permitted **by right** (no rezoning, special-use, or conditional-use approval required).
2. Order a **title / parcel report** to verify lot dimensions, road frontage, easements, and encumbrances.
3. Pull the **state DOT traffic count** for the fronting road to confirm AADT.

Once verified, run `rei-deal-analyzer` or `rei-investment-calculator` on the site to model the creative-finance acquisition.
