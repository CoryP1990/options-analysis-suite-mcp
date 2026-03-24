# Options Analysis Suite — Claude Desktop Extension

MCP (Model Context Protocol) server that gives Claude direct access to your options analysis data, market research, and portfolio risk metrics.

## Installation

1. Download the `.mcpb` extension file from your account at optionsanalysissuite.com
2. Open Claude Desktop → Settings → Extensions → Advanced Settings
3. Click "Install Extension" and select the `.mcpb` file
4. Enter your Options Analysis Suite email and password when prompted
5. (Optional) Add a Brave Search API key for web search capabilities

## What Claude Can Access

### Market Data (11 tools)
- **IV/HV History** — Historical implied and realized volatility
- **Greeks History** — Delta, gamma, theta, vega over time
- **Market Regime** — Stress score (0-100) with drivers and confidence
- **Earnings** — EPS history, estimates, surprise percentages
- **News** — Recent headlines and catalysts
- **Short Volume** — FINRA daily short selling data
- **Fundamentals** — Market cap, P/E, margins, sector
- **Yield Curve** — Treasury rates from 1M to 30Y
- **Insider Trading** — SEC Form 4 filings
- **Most Active Options** — Institutional flow by volume
- **Web Search** — Real-time financial information (requires Brave API key)

### Your Analysis Data (5 tools, requires sync enabled)
- **Analysis History** — Your pricing model calculations with Greeks
- **GEX Snapshots** — Gamma exposure, key levels, dealer positioning
- **Portfolio Snapshots** — Value, P&L, greeks, holdings over time
- **Risk Snapshots** — VaR, beta, Sharpe, stress tests, correlations
- **Analysis Rollups** — Daily/weekly trend aggregates

### Platform Info (1 tool)
- **Platform Info** — Pricing models, Greeks definitions, data sources

## Enabling Data Sync

To give Claude access to your personal analysis data:

1. Log in to Options Analysis Suite
2. Go to Account → AI Settings → Claude Desktop Sync
3. Toggle sync on
4. Your analysis data will automatically sync as you use the platform

Without sync enabled, Claude can still access all market data tools.

## Example Prompts

- "What's the current IV percentile for AAPL and how does it compare to the last 6 months?"
- "Show me my most recent analysis results for SPY"
- "What regime is the market currently in?"
- "Compare the Greeks from my last two TSLA analyses"
- "Is the vol surface showing any unusual skew right now?"
- "What's the short interest trend for GME?"
- "How has my portfolio risk changed over the past week?"

## Privacy

- Your login credentials are stored in the OS keychain (macOS Keychain / Windows Credential Manager)
- The extension only reads data — it never modifies your account or analysis data
- All data requests go through the platform's authenticated API
- No data is sent to third parties (except Brave Search if you provide an API key)

## Requirements

- Claude Desktop (macOS or Windows)
- Active Options Analysis Suite subscription (Professional or Trial)
- Node.js (bundled with Claude Desktop)

## Troubleshooting

**"Authentication failed"** — Check your email/password in extension settings. Make sure your subscription is active.

**"No data found"** — Enable Claude Desktop Sync in Account → AI Settings. Run some analyses first.

**"Web search not available"** — Add a Brave Search API key in extension settings (free at api.search.brave.com).

**Extension not responding** — Restart Claude Desktop. The extension runs as a local process and may need a fresh start after system sleep.

## Support

Contact support@optionsanalysissuite.com or visit optionsanalysissuite.com/documentation
