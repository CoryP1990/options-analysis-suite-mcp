# Options Analysis Suite — Claude Desktop Extension

MCP (Model Context Protocol) server that gives Claude direct access to your options analysis data, 32 market research tools, and personalized trade recommendations.

## Installation

1. Download the `.mcpb` extension file from your account at optionsanalysissuite.com
2. Open Claude Desktop → Settings → Extensions
3. Click "Install Extension" and select the `.mcpb` file
4. Enter your Options Analysis Suite email and password when prompted

## What Claude Can Access

### Market Data (23 tools)
- **IV/HV History** — Historical implied and realized volatility with percentile rankings
- **IV Surface** — Volatility skew across strikes and expirations
- **Greeks History** — Delta, gamma, theta, vega over time
- **Options Analytics History** — Daily snapshots of 20+ metrics (GEX, skew, walls, expected move, and more)
- **Options Chain** — Full end-of-day chain with strikes, OI, volume, IV, and Greeks
- **Stock Prices** — Historical OHLCV data
- **Market Regime** — Stress score with drivers and confidence
- **Risk-Free Rate** — Current Treasury-based rate for pricing models
- **Earnings** — EPS history, estimates, surprise percentages
- **Analyst Data** — Ratings, price targets, consensus estimates
- **News** — Recent headlines and catalysts
- **Short Volume** — FINRA daily short selling data
- **Short Interest** — Biweekly short interest as % of float
- **Dark Pool / ATS** — OTC and alternative trading system data
- **Fundamentals** — Market cap, P/E, margins, sector
- **Yield Curve** — Treasury rates from 1M to 30Y
- **Insider Trading** — SEC Form 4 filings
- **Activist Filings** — Schedule 13D/13G institutional positions
- **Fail-to-Deliver** — SEC FTD data
- **Threshold List** — Reg SHO threshold list history
- **Trading Halts** — Current and recent halts
- **Economic Calendar** — Upcoming macro events (FOMC, CPI, NFP, etc.)
- **Most Active Options** — Institutional flow by volume

### Your Analysis Data (8 tools, requires sync enabled)
- **Analysis History** — Your pricing model calculations with full Greeks across all models
- **FFT Scanner Results** — Characteristic function-based mispricing signals
- **GEX Snapshots** — Gamma exposure, key levels, dealer positioning
- **Portfolio Snapshots** — Value, P&L, aggregate Greeks, holdings over time
- **Risk Snapshots** — VaR, beta, Sharpe, stress tests, correlations
- **Analysis Rollups** — Daily/weekly trend aggregates
- **Research Notes** — Your annotations and tags
- **Structured Queries** — Filter analyses by delta, volatility, DTE ranges

### Platform Context (1 tool)
- **Platform Info** — Pricing models, Greeks definitions, data sources

## Enabling Data Sync

To give Claude access to your personal analysis data:

1. Log in to Options Analysis Suite
2. Go to Account → AI Settings → Data Sync
3. Toggle sync on
4. Your analysis data will automatically sync as you use the platform

Without sync enabled, Claude can still access all 23 market data tools.

## Example Prompts

- "What's the current IV percentile for AAPL and how does it compare to the last 6 months?"
- "According to my Variance Gamma and Black-Scholes calculations for GOOG, what do the Greeks say I'll lose over the weekend?"
- "My portfolio delta is +450 — given the current regime and META earnings next week, should I hedge?"
- "Compare the dark pool activity and short interest trend for AMD"
- "Show me all my analyses where volatility was above 40% in the last two weeks"
- "Is META IV expensive right now? Should I be buying or selling options?"
- "What's the theta decay on my NVDA straddle through the weekend?"
- "Based on my risk metrics, how would a 2008-style event impact my portfolio?"

## Privacy

- Your login credentials are stored in the OS keychain (macOS Keychain / Windows Credential Manager)
- The extension only reads data — it never modifies your account or analysis data
- All data requests go through the platform's authenticated API
- Data sync is opt-in and can be disabled at any time

## Requirements

- Claude Desktop (macOS or Windows)
- Active Options Analysis Suite subscription (Professional or Trial)
- Node.js (bundled with Claude Desktop)

## Troubleshooting

**"Authentication failed"** — Check your email/password in extension settings. Make sure your subscription is active.

**"No data found"** — Enable Data Sync in Account → AI Settings. Run some analyses first.

**Extension not responding** — Restart Claude Desktop. The extension runs as a local process and may need a fresh start after system sleep.

## Support

Contact optionsanalysissuite@gmail.com or visit optionsanalysissuite.com/documentation
