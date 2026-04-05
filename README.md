# Options Analysis Suite — AI Integration

MCP server that gives Claude, ChatGPT, and Perplexity direct access to your options analysis data, 44 tools, and personalized trade recommendations.

## How It Works in Practice

You're running an FFT mispricing scan across your portfolio tickers. On another tab, you've got the GEX chart open for SPY and you're watching dealer positioning shift. You run a Heston calibration on NVDA and the model says calls are 12% cheap relative to the surface. Your portfolio is long delta and you're not sure if you should hedge or press.

Ask the AI: "Based on my current positions and risk profile, what should I do about NVDA?"

It already knows. It pulls your portfolio snapshot — every position, every Greek, your net delta and gamma exposure. It sees the FFT scan flagging NVDA calls as underpriced. It checks your risk analysis — your VaR, your beta exposure, your stress test results. It reads the market regime score and sees we're in a normal environment. It pulls NVDA's IV percentile, the earnings date, analyst consensus, insider activity, and short interest.

Then it gives you a specific trade: "Sell the April 185 put to fund the April 195/210 call spread — your FFT scan confirms the calls are cheap, your portfolio needs more upside exposure, and earnings are 3 weeks out so you'll capture the IV crush on the short put." That's not generic advice from a chatbot. That's a copilot that's looking at your screens.

No copy-pasting data between tabs. No explaining your portfolio to the AI. No context-switching. Every calculation you've run, every snapshot you've taken, every risk metric you've computed — the AI sees it all, in real time, and gives you actionable recommendations grounded in your actual data.

## Supported Platforms

| Platform | Transport | Auth | Setup |
| --- | --- | --- | --- |
| Claude Desktop | Local stdio (`.mcpb` extension) | Credentials stored in OS keychain | Download extension from your account page |
| Claude Web / ChatGPT | Remote HTTP MCP | OAuth login flow | Add the remote connector URL |
| Perplexity | Remote HTTP MCP | API key (`base64(email:password)`) | Add MCP connector in settings |

## Current Tool Surface

The MCP currently exposes **44 tools**:

- **34 market and research tools**
- **9 synced user-data tools**
- **1 platform-context tool**

## Market And Research Tools

### Volatility, chain, and pricing structure

- **IV History** (`get_iv_history`) — Historical implied and realized volatility
- **Greeks History** (`get_greeks_history`) — Historical Greeks with recent/trend summaries plus DTE and moneyness filters
- **IV Surface** (`get_iv_surface`) — Surface and skew snapshots across strikes and expirations
- **Options Chain** (`get_options_chain`) — Latest available end-of-day chain summary with expirations, ATM term structure, skew, and representative near-money contracts
- **Options Analytics History** (`get_options_analytics_history`) — Daily analytics history including IV, skew, expected move, rates, dividend yield, GEX/DEX/VEX, and net vanna/charm/vomma
- **Risk-Free Rate** (`get_risk_free_rate`) — Current platform benchmark rate
- **Yield Curve** (`get_yield_curve`) — Treasury curve with key rates, inversion flags, and compact history

### Flow, positioning, and market structure

- **Most Active Options** (`get_most_active_options`) — Representative liquid contract flow leaders or aggregated ticker view
- **Unusual Options** (`get_unusual_options`) — Representative unusual flow ranked by volume/open-interest behavior
- **Short Volume** (`get_short_volume`) — FINRA daily short-selling summaries
- **Short Interest** (`get_short_interest`) — FINRA biweekly short interest with float-aware summaries
- **Dark Pool / ATS** (`get_dark_pool_data`) — OTC and ATS weekly trading summaries
- **Fail To Deliver** (`get_fail_to_deliver`) — SEC FTD history with recent spikes and trend context
- **Threshold History** (`get_threshold_history`) — Reg SHO threshold-list status and streak summaries
- **Trading Halts** (`get_trading_halts`) — Active and recent halts with duplicate feed rows condensed

### Regime and exposure

- **Market Regime** (`get_market_regime`) — Market composite stress regime with score bands, drivers, and compact feature z-scores
- **Intraday Regime** (`get_intraday_regime`) — Intraday regime scans with Greek exposure snapshots
- **Per-Symbol Regime** (`get_regime_symbol`) — Symbol-level regime classification and authoritative Greek exposures

### Company, events, and filings

- **Company Profile** (`get_company_profile`) — Normalized company metadata with float metrics, identifiers, and description
- **Fundamentals** (`get_fundamentals`) — Compact fundamentals with ratios and summarized statements
- **Earnings** (`get_earnings`) — Earnings history and estimates
- **Analyst Data** (`get_analyst_data`) — Ratings, price targets, nearest forward estimate periods, and compact rating-history summaries
- **News** (`get_news`) — Relevance-ranked company or ETF news with raw-feed fallback via `full=true`
- **Insider Trading** (`get_insider_trading`) — Grouped Form 4 buy/sell activity with administrative activity summarized
- **Activist Filings** (`get_activist_filings`) — 13D/13G ownership filings with current above-threshold holders prioritized
- **SEC Filings** (`get_sec_filings`) — EDGAR filing summaries with recent filing lists
- **Dividends** (`get_dividends`) — Per-symbol dividend history
- **Stock Splits** (`get_stock_splits`) — Per-symbol split history

### Calendars and general market context

- **Economic Calendar** (`get_economic_calendar`) — Catalyst-focused macro event calendar
- **IPO Calendar** (`get_ipo_calendar`) — Upcoming and recent IPO events
- **Dividend Calendar** (`get_dividend_calendar`) — Upcoming and recent dividend events
- **Split Calendar** (`get_split_calendar`) — Upcoming and recent split events
- **Stock Prices** (`get_stock_prices`) — Historical OHLCV with compact trend summary
- **Web Search** (`web_search`) — Real-time web search for market information and breaking news

## Synced User-Data Tools

These require account sync to be enabled.

- **Analysis History** (`get_analysis_history`) — Pricing model history with near-identical reruns collapsed by default
- **Query Analysis** (`query_analysis`) — Filtered analysis-history queries by delta, volatility, and DTE
- **FFT Results** (`get_fft_results`) — FFT scanner mispricing signals and calibration data
- **GEX Snapshot** (`get_gex_snapshot`) — Saved gamma exposure snapshots
- **Portfolio Snapshot** (`get_portfolio_snapshot`) — Portfolio value, positions, P&L, and aggregate Greeks over time
- **Risk Snapshot** (`get_risk_snapshot`) — VaR, beta, drawdown, Sharpe, volatility, and stress snapshots
- **Analysis Rollups** (`get_analysis_rollups`) — Daily or weekly trend aggregates over your analysis activity
- **User Annotations** (`get_user_annotations`) — Research notes, tags, and alerts
- **Account Info** (`get_account_info`) — Subscription state and MCP capabilities such as web search availability

## Platform Context

- **Platform Info** (`get_platform_info`) — Pricing models, Greeks definitions, data-source notes, and platform capabilities

## Enabling Sync

To give the assistant access to your personal analysis data:

1. Log in to Options Analysis Suite
2. Open `Account -> AI Settings`
3. Enable data sync
4. Run analyses, FFT scans, GEX scans, or portfolio/risk snapshots in the app

Without sync enabled, the assistant can still use the market and research tools.

## Example questions you can ask:

- "According to my Variance Gamma and Black-Scholes calculations for GOOG, what do the Greeks say I'll lose on my position over the weekend?"
- "Compare my Heston vs SABR calibrations for SPY — which model fits the current skew better and what does that imply for my put spreads?"
- "My portfolio delta is showing +450 — given the current market regime and META earnings next week, should I hedge? What structure would you recommend?"
- "Look at my GEX analysis for TSLA — where are the key gamma walls and what happens to my position if we break through the put wall?"
- "Show me all my analyses where volatility was above 40% in the last two weeks. Were any of those good short vol entries?"
- "What's the theta decay on my NVDA straddle through the weekend and into Monday's economic data releases?"
- "Compare the dark pool activity and short interest trend for AMD — is institutional flow confirming or contradicting the bullish options skew?"
- "Based on my risk metrics and current VaR, how much would a 2008-style stress event impact my portfolio?"
- "Is META IV expensive right now? Should I be buying or selling options?"
- "Explain what my Heston calibration results mean in plain English"

## Privacy

- Claude Desktop stores credentials in the OS keychain
- Remote MCP clients authenticate through OAuth or explicit API-key credentials
- The tools are read-only against your synced account data
- Sync is opt-in and can be disabled at any time

## Requirements

- Active Options Analysis Suite subscription
- Claude Desktop, ChatGPT, Claude Web, or Perplexity
- Sync enabled if you want personal analysis data in addition to market data

## Support

Contact `optionsanalysissuite@gmail.com` or visit `optionsanalysissuite.com/documentation`.
