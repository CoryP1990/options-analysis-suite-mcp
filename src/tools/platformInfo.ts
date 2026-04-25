/**
 * Platform Info Tool
 *
 * Returns static background information about the platform.
 * Claude calls this when it needs context about models, Greeks, or data sources.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const PLATFORM_INFO: Record<string, string> = {
  models: `Options Analysis Suite Pricing Models:
- Black-Scholes: Classic closed-form. Fast, assumes constant volatility. Best for European equity options.
- Binomial (CRR): Lattice model. Handles American options, dividends. Configurable time steps.
- Heston: Stochastic volatility (vol-of-vol, mean reversion, correlation). Captures skew/smile.
- SABR: Stochastic Alpha Beta Rho. Standard for swaptions and FX, good for equity smile.
- Local Volatility (Dupire): Non-parametric surface from market prices. Most accurate for exotics.
- American PDE: Finite-difference solver on Black-Scholes PDE. Smooth Greeks, handles early exercise.
- Monte Carlo: Simulation-based. Handles path-dependent exotics. Outputs confidence bands.
- FFT (Carr-Madan): Frequency-domain pricing. Efficient for Heston/Bates/Kou jump models.
- Variance Gamma: Jump-diffusion with finite-activity jumps. Models fat tails and skew.
- Barrier/Asian/Lookback/Digital: Exotic option types with path-dependent payoffs.`,

  greeks: `Greeks — Option Price Sensitivities:
- Delta: Price change per $1 move in underlying. Call: [0,1], Put: [-1,0]. Used for hedge ratios.
- Gamma: Rate of delta change. Highest ATM, near expiry. High gamma = rapid delta shifts.
- Theta: Daily time decay ($). Always negative for long options. Accelerates near expiration.
- Vega: Price change per 1% IV change. Highest ATM, far expiry. Key for vol trading.
- Rho: Price change per 1% rate change. Usually small except long-dated, deep ITM.
- Vanna: Delta sensitivity to volatility. Cross-Greek for skew/smile dynamics.
- Charm: Delta decay over time (delta theta). Important for hedging near expiry.
- Vomma: Vega sensitivity to volatility. Matters for vol-of-vol strategies.
- Speed: Gamma change per $1 underlying move. Third-order, matters for large moves.`,

  data_sources: `Platform Data Sources:
- Options chains & Greeks: Tradier API (real-time quotes, historical)
- Fundamentals & corporate actions: Financial Modeling Prep (financials, earnings, analyst data, insider trading, dividends, splits, IPO/dividend/split calendars)
- Treasury/Economic: FRED (Federal Reserve Economic Data, yield curves)
- Short volume: FINRA daily short volume reports
- SEC filings: EDGAR (recent company filings, Form 4 insider, 13D/G activist, fail-to-deliver)
- Market regime: Proprietary composite score (VIX, credit spreads, breadth, correlation, tail risk)
- News: Aggregated financial news via multiple sources
- GEX data: Computed from options chain (gamma/delta exposure by strike)`,

  capabilities: `Platform Capabilities:
- Multi-model option pricing with live calibration to market prices
- GEX (Gamma Exposure) analysis: call/put walls, gamma flip, dealer positioning
- Portfolio risk: VaR (Historical + Monte Carlo), beta, Sharpe, stress tests, correlation matrix
- FFT Options Scanner: frequency-domain mispricing detection across entire chains
- Analysis history: all pricing calculations stored locally, synced for AI analysis
- Structured queries: "show analyses where delta > 0.8 last month" via RAG
- Market regime: raw composite stress score (z-style bands) with confidence and drivers`,
};

export function registerPlatformInfo(server: McpServer): void {
  server.registerTool(
    'get_platform_info',
    {
      title: 'Platform Info',
      description: 'Get background information about the Options Analysis Suite platform — available pricing models, what the Greeks mean, data sources, and capabilities. Call this when you need context about the platform to give better answers.',
      inputSchema: {
        topic: z.enum(['models', 'greeks', 'data_sources', 'capabilities', 'all']).default('all')
          .describe('Which topic to get info about'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) => {
      if (topic === 'all') {
        const text = Object.values(PLATFORM_INFO).join('\n\n');
        return { content: [{ type: 'text', text }] };
      }
      const text = PLATFORM_INFO[topic] || 'Unknown topic.';
      return { content: [{ type: 'text', text }] };
    },
  );
}
