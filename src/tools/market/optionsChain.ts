import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_options_chain',
    'Get the end-of-day options chain snapshot from the most recent completed trading session. Data is sourced from ORATS and available after 1 AM ET the following day, so on Tuesday evening the latest data is from Monday. Shows strikes, expirations, open interest, volume, IV, and Greeks. Returns the 100 most liquid contracts by default — use full=true for all.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      full: z.boolean().optional().describe('Return all contracts (can be 2000+ for broad ETFs). Default false — returns top 100 by open interest.'),
    },
    toolHandler(async ({ symbol, full }) => {
      // ORATS EOD data is pulled at 1 AM ET, so the latest available chain
      // is always the previous trading day. Before 1 AM ET, go back an extra
      // trading day since that day's data isn't available yet.
      // Use ET timezone via Intl to handle DST transitions correctly.
      const etFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false,
      });
      const etParts = etFmt.formatToParts(new Date());
      const etYear = Number(etParts.find(p => p.type === 'year')!.value);
      const etMonth = Number(etParts.find(p => p.type === 'month')!.value);
      const etDayNum = Number(etParts.find(p => p.type === 'day')!.value);
      const etHour = Number(etParts.find(p => p.type === 'hour')!.value);
      // Use Date.UTC to avoid host-timezone drift on stdio installs
      const etDate = new Date(Date.UTC(etYear, etMonth - 1, etDayNum));
      // Before 1 AM ET on Tue-Fri, today's ORATS data isn't available — need one extra trading day back.
      // Mon/Sat/Sun already point to Friday regardless of hour (weekend = no new data to wait for).
      const dow = etDate.getUTCDay(); // 0=Sun, 1=Mon, 6=Sat
      const preOrats = etHour < 1 && dow >= 2 && dow <= 5; // Tue-Fri before 1 AM
      const tradingDaysBack = preOrats ? 2 : 1;
      // Subtract N trading days (skip weekends)
      let remaining = tradingDaysBack;
      while (remaining > 0) {
        etDate.setUTCDate(etDate.getUTCDate() - 1);
        const dow = etDate.getUTCDay();
        if (dow !== 0 && dow !== 6) remaining--;
      }
      const date = etDate.toISOString().split('T')[0];

      const res = await client.get('/scanner/options-chain', {
        ticker: symbol.toUpperCase(),
        date,
      }) as any;

      if (full) return { _skipSizeGuard: true, data: res };

      if (res && Array.isArray(res.contracts) && res.contracts.length > 100) {
        res.contracts.sort((a: any, b: any) => (b.openInterest || 0) - (a.openInterest || 0));
        res._contracts_note = `Showing top 100 of ${res.contracts.length} contracts by open interest. Use full=true for all.`;
        res.contracts = res.contracts.slice(0, 100);
      }

      return res;
    }),
  );
}
