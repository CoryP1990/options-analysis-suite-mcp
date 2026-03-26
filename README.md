# Options Analysis Suite — AI Integration

MCP server that gives Claude, ChatGPT, and Perplexity direct access to your options analysis data, 37 market research tools, and personalized trade recommendations.

## How It Works

You're running an FFT mispricing scan across your portfolio tickers. On another tab, you've got the GEX chart open and you're watching dealer positioning shift. You run a Heston calibration on NVDA and the model says calls are 12% cheap relative to the surface. Your portfolio is long delta and you're not sure if you should hedge or press.

Ask the AI: *"Based on my current positions and risk profile, what should I do about NVDA?"*

It already knows. It pulls your portfolio snapshot — every position, every Greek, your net delta and gamma exposure. It sees the FFT scan flagging NVDA calls as underpriced. It checks your risk analysis — your VaR, your beta exposure, your stress test results. It reads the market regime score and sees we're in a normal environment. It pulls NVDA's IV percentile, the earnings date, analyst consensus, insider activity, and short interest.

Then it gives you a specific trade — not generic advice from a chatbot, but a recommendation grounded in your actual data.

## Supported Platforms

| Platform | Transport | Auth | Setup |
|----------|-----------|------|-------|
| **Claude Desktop** | Local stdio (.mcpb extension) | Credentials in OS keychain | Download extension from Account page |
| **ChatGPT** | Remote HTTP (OAuth) | OAuth login flow | Settings → Developer Mode → Apps → Create |
| **Perplexity** | Remote HTTP (API key) | base64(email:password) | Settings → MCP Connectors → Add |

All three platforms access the same 37 tools and your synced analysis data.

## What the AI Can Access

### Market Data (27 tools)
- **IV/HV History** — Historical implied and realized volatility with percentile rankings
- **IV Surface** — Volatility skew across strikes and expirations
- **Greeks History** — Delta, gamma, theta, vega over time
- **Options Analytics History** — Daily snapshots of 20+ metrics (GEX, skew, walls, expected move, and more)
- **Options Chain** — Full end-of-day chain with strikes, OI, volume, IV, and Greeks
- **Stock Prices** — Historical OHLCV data
- **Market Regime** — Stress scoring with 6 Greek exposure snapshots (gamma, delta, vega, vanna, charm, vomma)
- **Intraday Regime** — Intraday regime scans across 5 daily intervals with Greek exposures
- **Per-Symbol Regime & Exposures** — Regime classification with all 6 Greek exposures, gamma flip, walls, and top strikes
- **Unusual Options Activity** — Tickers with abnormally high volume relative to open interest
- **Company Profile** — Sector, industry, market cap, description, and key identifiers
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

### Your Analysis Data (9 tools, requires sync enabled)
- **Analysis History** — Your pricing model calculations with full Greeks across all models
- **FFT Scanner Results** — Characteristic function-based mispricing signals
- **GEX Snapshots** — Gamma exposure, key levels, dealer positioning
- **Portfolio Snapshots** — Value, P&L, aggregate Greeks, holdings over time
- **Risk Snapshots** — VaR, beta, Sharpe, stress tests, correlations
- **Analysis Rollups** — Daily/weekly trend aggregates
- **Research Notes** — Your annotations and tags
- **Structured Queries** — Filter analyses by delta, volatility, DTE ranges
- **Account Info** — Subscription tier, capabilities, and web search availability

### Platform Context (1 tool)
- **Platform Info** — Pricing models, Greeks definitions, data sources

## Enabling Data Sync

To give the AI access to your personal analysis data:

1. Log in to Options Analysis Suite
2. Go to Account → AI Settings → Data Sync
3. Toggle sync on
4. Your analysis data will automatically sync as you use the platform

Without sync enabled, the AI can still access all 27 market data tools.

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

- Claude Desktop stores credentials in the OS keychain (macOS Keychain / Windows Credential Manager)
- ChatGPT uses OAuth — you sign in through our secure login page, no credentials stored by ChatGPT
- Perplexity uses an API key (base64-encoded credentials) — transmitted only over HTTPS
- All integrations are read-only — they never modify your account or analysis data
- Data sync is opt-in and can be disabled at any time

## Requirements

- Active Options Analysis Suite subscription (Professional or Trial)
- Claude Desktop: macOS or Windows
- ChatGPT: Web or desktop app with Developer Mode enabled
- Perplexity: Web or desktop app

## Troubleshooting

**"Authentication failed"** — Check your credentials. Make sure your subscription is active.

**"No data found"** — Enable Data Sync in Account → AI Settings. Run some analyses first.

**Extension not responding (Claude Desktop)** — Restart Claude Desktop. The extension runs as a local process.

## Support

Contact optionsanalysissuite@gmail.com or visit optionsanalysissuite.com/documentation
