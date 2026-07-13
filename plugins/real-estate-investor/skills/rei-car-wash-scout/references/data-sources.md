# Recommended Data Sources & APIs

To successfully execute the Car Wash Site Scout skill, utilize the following data sources and tools.

## 1. Demographics
- **Census QuickFacts**: `https://www.census.gov/quickfacts/`
  - Best for quick, manual lookups of city-level population and median household income.
- **Census Data API**: `https://api.census.gov/data.html`
  - Best for programmatic retrieval of ACS 5-year estimates.
  - Variables: `B01003_001E` (Total Population), `B19013_001E` (Median Household Income).

## 2. Property Records & Zoning
- **BatchData MCP Server**: `https://mcp.batchdata.com`
  - Highly recommended if available. Provides comprehensive property intelligence, including zoning, lot size, and ownership.
  - Tools: `lookup_property`, `search_properties`.
- **Regrid API**: `https://regrid.com/api`
  - Excellent for parcel boundaries, standardized zoning, and land use codes.
- **County Assessor / GIS Portals**:
  - The ultimate source of truth for zoning ordinances and parcel dimensions. Often requires manual web searching per county.

## 3. Traffic Counts (AADT)
- **State DOT Traffic Portals**:
  - Every state Department of Transportation maintains a public traffic data portal (e.g., Florida DOT Traffic Online).
  - Search query: `[State] DOT traffic counts map`.

## 4. Commercial Land Listings
- **LoopNet**: `https://www.loopnet.com/`
- **Crexi**: `https://www.crexi.com/`
- **Land.com**: `https://www.land.com/`
  - Use web search to find listings on these platforms matching the target criteria (price $\le$ $1M, size 1.5-2 acres).
