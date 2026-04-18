/**
 * Tool Registry
 *
 * Registers all MCP tools on the server.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../proxy/proxyClient.js';
import type { TokenManager } from '../auth/tokenManager.js';

// Market data tools
import { register as ivHistory } from './market/ivHistory.js';
import { register as greeksHistory } from './market/greeksHistory.js';
import { register as marketRegime } from './market/marketRegime.js';
import { register as earnings } from './market/earnings.js';
import { register as news } from './market/news.js';
import { register as shortVolume } from './market/shortVolume.js';
import { register as fundamentals } from './market/fundamentals.js';
import { register as dividends } from './market/dividends.js';
import { register as yieldCurve } from './market/yieldCurve.js';
import { register as insiderTrading } from './market/insiderTrading.js';
import { register as riskFreeRate } from './market/riskFreeRate.js';
import { register as optionsAnalyticsHistory } from './market/optionsAnalyticsHistory.js';
import { register as ivSurface } from './market/ivSurface.js';
import { register as stockPrices } from './market/stockPrices.js';
import { register as stockSplits } from './market/stockSplits.js';
import { register as shortInterest } from './market/shortInterest.js';
import { register as analystData } from './market/analystData.js';
import { register as economicCalendar } from './market/economicCalendar.js';
import { register as ipoCalendar } from './market/ipoCalendar.js';
import { register as dividendCalendar } from './market/dividendCalendar.js';
import { register as splitCalendar } from './market/splitCalendar.js';
import { register as optionsChain } from './market/optionsChain.js';
import { register as secFilings } from './market/secFilings.js';
import { register as failToDeliver } from './market/failToDeliver.js';
import { register as thresholdHistory } from './market/thresholdList.js';
import { register as darkPoolData } from './market/darkPoolData.js';
import { register as tradingHalts } from './market/tradingHalts.js';
import { register as activistFilings } from './market/activistFilings.js';
import { register as webSearch } from './market/webSearch.js';
import { register as companyProfile } from './market/companyProfile.js';
import { register as regimeSymbol } from './market/regimeSymbol.js';
import { register as screeners } from './market/screeners.js';

// Platform info
import { registerPlatformInfo } from './platformInfo.js';

// User data tools (synced from browser)
import { register as analysisHistory } from './user/analysisHistory.js';
import { register as gexSnapshot } from './user/gexSnapshot.js';
import { register as portfolioSnapshot } from './user/portfolioSnapshot.js';
import { register as riskSnapshot } from './user/riskSnapshot.js';
import { register as analysisRollups } from './user/analysisRollups.js';
import { register as fftResults } from './user/fftResults.js';
import { register as annotations } from './user/annotations.js';
import { register as queryAnalysis } from './user/queryAnalysis.js';
import { register as accountInfo } from './user/accountInfo.js';
import { register as computeRuns } from './user/computeRuns.js';

export function registerAllTools(
  server: McpServer,
  client: ProxyClient,
  tokenManager: TokenManager,
): void {
  // Market data tools (see tool files under ./market/). Individual
  // most-active / unusual convenience tools were folded into
  // run_screener to keep the options-market surface consistent.
  ivHistory(server, client);
  greeksHistory(server, client);
  marketRegime(server, client);
  earnings(server, client);
  news(server, client);
  shortVolume(server, client);
  fundamentals(server, client);
  dividends(server, client);
  yieldCurve(server, client);
  insiderTrading(server, client);
  riskFreeRate(server, client);
  optionsAnalyticsHistory(server, client);
  ivSurface(server, client);
  stockPrices(server, client);
  stockSplits(server, client);
  shortInterest(server, client);
  analystData(server, client);
  economicCalendar(server, client);
  ipoCalendar(server, client);
  dividendCalendar(server, client);
  splitCalendar(server, client);
  optionsChain(server, client);
  secFilings(server, client);
  failToDeliver(server, client);
  thresholdHistory(server, client);
  darkPoolData(server, client);
  tradingHalts(server, client);
  activistFilings(server, client);
  webSearch(server, client);
  companyProfile(server, client);
  regimeSymbol(server, client);
  screeners(server, client);

  // Platform info (1 tool)
  registerPlatformInfo(server);

  // User data (10 tools — synced from browser via /sync/* endpoints + account info)
  analysisHistory(server, client);
  gexSnapshot(server, client);
  portfolioSnapshot(server, client);
  riskSnapshot(server, client);
  analysisRollups(server, client);
  fftResults(server, client);
  annotations(server, client);
  queryAnalysis(server, client);
  accountInfo(server, client, tokenManager);
  computeRuns(server, client);
}
