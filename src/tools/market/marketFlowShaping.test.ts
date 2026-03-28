import { describe, expect, it } from 'bun:test';
import {
  summarizeMostActiveOptions,
  summarizeShortInterest,
  summarizeShortVolume,
} from './marketFlowShaping.js';

describe('summarizeMostActiveOptions', () => {
  it('builds a contract-level summary with by-underlying aggregation', () => {
    const summarized = summarizeMostActiveOptions({
      type: 'contract',
      index: 'all',
      timestamp: '2026-03-27T05:00:20.797+00:00',
      data: [
        {
          symbol: 'AAPL260327C00250000',
          underlying: 'AAPL',
          type: 'call',
          strike: 250,
          expiration: '2026-03-27',
          volume: 10000,
          openInterest: 8000,
          iv: 0.28,
          volumeOIRatio: 1.25,
          delta: 0.52,
          index: 'sp500',
        },
        {
          symbol: 'AAPL260327P00245000',
          underlying: 'AAPL',
          type: 'put',
          strike: 245,
          expiration: '2026-03-27',
          volume: 7000,
          openInterest: 12000,
          iv: 0.31,
          volumeOIRatio: 0.58,
          delta: -0.45,
          index: 'sp500',
        },
        {
          symbol: 'TSLA260327C00375000',
          underlying: 'TSLA',
          type: 'call',
          strike: 375,
          expiration: '2026-03-27',
          volume: 12000,
          openInterest: 9000,
          iv: 0.46,
          volumeOIRatio: 1.33,
          delta: 0.5,
          index: 'sp500',
        },
      ],
    }) as Record<string, any>;

    expect(summarized.type).toBe('contract');
    expect(summarized.summary.returnedContracts).toBe(3);
    expect(summarized.summary.rawContractsConsidered).toBe(3);
    expect(summarized.summary.uniqueUnderlyings).toBe(2);
    expect(summarized.summary.callContracts).toBe(2);
    expect(summarized.summary.putContracts).toBe(1);
    expect(summarized.byUnderlying[0].underlying).toBe('AAPL');
    expect(summarized.byUnderlying[0].contractCount).toBe(2);
    expect(summarized.byUnderlying[0].representativeQuality).toBe('selected');
    expect(summarized.byUnderlying[1].representativeContract.symbol).toBe('TSLA260327C00375000');
    expect(summarized.byUnderlying[1].representativeQuality).toBe('selected');
    expect(summarized.contracts).toHaveLength(3);
  });

  it('filters penny and far-dated outliers out of the default contract view while keeping raw aggregate totals', () => {
    const summarized = summarizeMostActiveOptions({
      type: 'contract',
      index: 'all',
      timestamp: '2026-03-27T05:00:20.797+00:00',
      data: [
        {
          symbol: 'META270115C00750000',
          underlying: 'META',
          type: 'call',
          strike: 750,
          expiration: '2027-01-15',
          volume: 201489,
          openInterest: 4370,
          iv: 0.376,
          volumeOIRatio: 46.1073,
          delta: 0.31,
          bid: 23.75,
          ask: 24.15,
          last: 23.96,
          index: 'sp500',
        },
        {
          symbol: 'AAL260327P00010000',
          underlying: 'AAL',
          type: 'put',
          strike: 10,
          expiration: '2026-03-27',
          volume: 98266,
          openInterest: 7848,
          iv: 0.806,
          volumeOIRatio: 12.5212,
          bid: 0.01,
          ask: 0.02,
          last: 0.01,
          index: 'sp400',
        },
        {
          symbol: 'TSLA260327P00375000',
          underlying: 'TSLA',
          type: 'put',
          strike: 375,
          expiration: '2026-03-27',
          volume: 89740,
          openInterest: 7878,
          iv: 0.474,
          volumeOIRatio: 11.3912,
          delta: -0.58,
          bid: 4.8,
          ask: 4.9,
          last: 4.84,
          index: 'sp500',
        },
        {
          symbol: 'SPY260401C00650000',
          underlying: 'SPY',
          type: 'call',
          strike: 650,
          expiration: '2026-04-01',
          volume: 82000,
          openInterest: 12000,
          iv: 0.26,
          volumeOIRatio: 6.83,
          delta: 0.43,
          bid: 6.7,
          ask: 6.8,
          last: 6.75,
          index: 'etf',
        },
        {
          symbol: 'AAPL260417C00252500',
          underlying: 'AAPL',
          type: 'call',
          strike: 252.5,
          expiration: '2026-04-17',
          volume: 78000,
          openInterest: 18000,
          iv: 0.282,
          volumeOIRatio: 4.33,
          delta: 0.54,
          bid: 7.35,
          ask: 7.55,
          last: 7.45,
          index: 'sp500',
        },
        {
          symbol: 'NVDA260327P00170000',
          underlying: 'NVDA',
          type: 'put',
          strike: 170,
          expiration: '2026-03-27',
          volume: 91824,
          openInterest: 39416,
          iv: 0.471,
          volumeOIRatio: 2.3296,
          delta: -0.34,
          bid: 0.93,
          ask: 0.94,
          last: 0.92,
          index: 'sp500',
        },
      ],
    }, 4) as Record<string, any>;

    expect(summarized.summary.rawContractsConsidered).toBe(6);
    expect(summarized.summary.returnedContracts).toBe(4);
    expect(summarized.summary.totalVolume).toBe(641319);
    const selectedSymbols = summarized.contracts.map((contract: any) => contract.symbol);
    expect(selectedSymbols).toHaveLength(4);
    expect(selectedSymbols).toEqual(expect.arrayContaining([
      'AAPL260417C00252500',
      'TSLA260327P00375000',
      'SPY260401C00650000',
      'NVDA260327P00170000',
    ]));
    expect(selectedSymbols).not.toContain('META270115C00750000');
    expect(selectedSymbols).not.toContain('AAL260327P00010000');
    const aalRow = summarized.byUnderlying.find((row: any) => row.underlying === 'AAL');
    expect(aalRow?.representativeContract).toBeNull();
    expect(aalRow?.representativeQuality).toBe('weak_raw_leader');
    expect(String(aalRow?.representativeContractNote)).toContain('omits a specific representative contract');
    expect(String(summarized._contracts_note)).toContain('representative contracts out of 6 unique raw leaders');
  });

  it('demotes far-dated LEAPS and sub-1 volumeOI contracts when enough stronger current-flow contracts exist', () => {
    const summarized = summarizeMostActiveOptions({
      type: 'contract',
      index: 'all',
      timestamp: '2026-03-27T05:00:20.797+00:00',
      data: [
        {
          symbol: 'META270115C00750000',
          underlying: 'META',
          type: 'call',
          strike: 750,
          expiration: '2027-01-15',
          volume: 201489,
          openInterest: 4370,
          iv: 0.376,
          volumeOIRatio: 46.1073,
          delta: 0.31,
          bid: 23.75,
          ask: 24.15,
          last: 23.96,
          index: 'sp500',
        },
        {
          symbol: 'AMZN270115C00275000',
          underlying: 'AMZN',
          type: 'call',
          strike: 275,
          expiration: '2027-01-15',
          volume: 200136,
          openInterest: 4931,
          iv: 0.347,
          volumeOIRatio: 40.5873,
          delta: 0.29,
          bid: 8.95,
          ask: 9.1,
          last: 8.98,
          index: 'sp500',
        },
        {
          symbol: 'UAL260417C00105000',
          underlying: 'UAL',
          type: 'call',
          strike: 105,
          expiration: '2026-04-17',
          volume: 56946,
          openInterest: 74555,
          iv: 0.657,
          volumeOIRatio: 0.7638,
          delta: 0.42,
          bid: 2.06,
          ask: 2.15,
          last: 2.07,
          index: 'sp500',
        },
        {
          symbol: 'AAPL260327P00255000',
          underlying: 'AAPL',
          type: 'put',
          strike: 255,
          expiration: '2026-03-27',
          volume: 69254,
          openInterest: 3378,
          iv: 0.315,
          volumeOIRatio: 20.5015,
          bid: 2.94,
          ask: 2.98,
          last: 2.96,
          index: 'sp500',
        },
        {
          symbol: 'TSLA260327C00380000',
          underlying: 'TSLA',
          type: 'call',
          strike: 380,
          expiration: '2026-03-27',
          volume: 89166,
          openInterest: 4850,
          iv: 0.467,
          volumeOIRatio: 18.3847,
          bid: 1.19,
          ask: 1.21,
          last: 1.2,
          index: 'sp500',
        },
        {
          symbol: 'TSLA260327C00377500',
          underlying: 'TSLA',
          type: 'call',
          strike: 377.5,
          expiration: '2026-03-27',
          volume: 46280,
          openInterest: 1626,
          iv: 0.469,
          volumeOIRatio: 28.4625,
          bid: 1.87,
          ask: 1.89,
          last: 1.86,
          index: 'sp500',
        },
        {
          symbol: 'NVDA260402C00177500',
          underlying: 'NVDA',
          type: 'call',
          strike: 177.5,
          expiration: '2026-04-02',
          volume: 46125,
          openInterest: 3179,
          iv: 0.377,
          volumeOIRatio: 14.5093,
          bid: 1.53,
          ask: 1.54,
          last: 1.54,
          index: 'sp500',
        },
        {
          symbol: 'AAPL260327P00252500',
          underlying: 'AAPL',
          type: 'put',
          strike: 252.5,
          expiration: '2026-03-27',
          volume: 47503,
          openInterest: 3207,
          iv: 0.33,
          volumeOIRatio: 14.8123,
          bid: 1.58,
          ask: 1.61,
          last: 1.57,
          index: 'sp500',
        },
      ],
    }, 6) as Record<string, any>;

    const selectedSymbols = summarized.contracts.map((contract: any) => contract.symbol);
    expect(selectedSymbols).toEqual(expect.arrayContaining([
      'AAPL260327P00255000',
      'TSLA260327C00380000',
      'TSLA260327C00377500',
      'NVDA260402C00177500',
      'AAPL260327P00252500',
    ]));
    expect(selectedSymbols).not.toContain('META270115C00750000');
    expect(selectedSymbols).not.toContain('AMZN270115C00275000');
    expect(selectedSymbols).not.toContain('UAL260417C00105000');
  });

  it('deduplicates repeated raw contracts and avoids padding with weak fallbacks when enough strong contracts exist', () => {
    const summarized = summarizeMostActiveOptions({
      type: 'contract',
      index: 'all',
      timestamp: '2026-03-27T05:00:20.797+00:00',
      data: [
        {
          symbol: 'AAPL260327P00255000',
          underlying: 'AAPL',
          type: 'put',
          strike: 255,
          expiration: '2026-03-27',
          volume: 69254,
          openInterest: 3378,
          iv: 0.315,
          volumeOIRatio: 20.5015,
          bid: 2.94,
          ask: 2.98,
          last: 2.96,
          index: 'sp500',
        },
        {
          symbol: 'TSLA260327C00380000',
          underlying: 'TSLA',
          type: 'call',
          strike: 380,
          expiration: '2026-03-27',
          volume: 89166,
          openInterest: 4850,
          iv: 0.467,
          volumeOIRatio: 18.3847,
          bid: 1.19,
          ask: 1.21,
          last: 1.2,
          index: 'sp500',
        },
        {
          symbol: 'TSLA260327C00377500',
          underlying: 'TSLA',
          type: 'call',
          strike: 377.5,
          expiration: '2026-03-27',
          volume: 46280,
          openInterest: 1626,
          iv: 0.469,
          volumeOIRatio: 28.4625,
          bid: 1.87,
          ask: 1.89,
          last: 1.86,
          index: 'sp500',
        },
        {
          symbol: 'NVDA260402C00177500',
          underlying: 'NVDA',
          type: 'call',
          strike: 177.5,
          expiration: '2026-04-02',
          volume: 46125,
          openInterest: 3179,
          iv: 0.377,
          volumeOIRatio: 14.5093,
          bid: 1.53,
          ask: 1.54,
          last: 1.54,
          index: 'sp500',
        },
        {
          symbol: 'AAPL260327P00252500',
          underlying: 'AAPL',
          type: 'put',
          strike: 252.5,
          expiration: '2026-03-27',
          volume: 47503,
          openInterest: 3207,
          iv: 0.33,
          volumeOIRatio: 14.8123,
          bid: 1.58,
          ask: 1.61,
          last: 1.57,
          index: 'sp500',
        },
        {
          symbol: 'NVDA260327P00172500',
          underlying: 'NVDA',
          type: 'put',
          strike: 172.5,
          expiration: '2026-03-27',
          volume: 66317,
          openInterest: 12422,
          iv: 0.438,
          volumeOIRatio: 5.3387,
          bid: 1.9,
          ask: 1.92,
          last: 1.92,
          index: 'sp500',
        },
        {
          symbol: 'NFLX260327C00095000',
          underlying: 'NFLX',
          type: 'call',
          strike: 95,
          expiration: '2026-03-27',
          volume: 41606,
          openInterest: 12073,
          iv: 0.425,
          volumeOIRatio: 3.4462,
          bid: 0.33,
          ask: 0.35,
          last: 0.33,
          index: 'sp500',
        },
        {
          symbol: 'NFLX260327C00095000',
          underlying: 'NFLX',
          type: 'call',
          strike: 95,
          expiration: '2026-03-27',
          volume: 41606,
          openInterest: 12073,
          iv: 0.425,
          volumeOIRatio: 3.4462,
          bid: 0.33,
          ask: 0.35,
          last: 0.33,
          index: 'sp500',
        },
        {
          symbol: 'UAL260417C00105000',
          underlying: 'UAL',
          type: 'call',
          strike: 105,
          expiration: '2026-04-17',
          volume: 56946,
          openInterest: 74555,
          iv: 0.657,
          volumeOIRatio: 0.7638,
          bid: 2.06,
          ask: 2.15,
          last: 2.07,
          index: 'sp500',
        },
        {
          symbol: 'INTC260327P00042000',
          underlying: 'INTC',
          type: 'put',
          strike: 42,
          expiration: '2026-03-27',
          volume: 49391,
          openInterest: 8119,
          iv: 0.722,
          volumeOIRatio: 6.0834,
          bid: 0.07,
          ask: 0.09,
          last: 0.08,
          index: 'sp500',
        },
      ],
    }, 10) as Record<string, any>;

    const selectedSymbols = summarized.contracts.map((contract: any) => contract.symbol);
    expect(summarized.summary.rawContractsConsidered).toBe(10);
    expect(summarized.summary.uniqueContractsConsidered).toBe(9);
    expect(selectedSymbols).toHaveLength(7);
    expect(new Set(selectedSymbols).size).toBe(7);
    expect(selectedSymbols).toContain('NFLX260327C00095000');
    expect(selectedSymbols).not.toContain('UAL260417C00105000');
    expect(selectedSymbols).not.toContain('INTC260327P00042000');
    const ualRow = summarized.byUnderlying.find((row: any) => row.underlying === 'UAL');
    expect(ualRow?.representativeContract).toBeNull();
    expect(ualRow?.representativeQuality).toBe('weak_raw_leader');
    expect(String(ualRow?.representativeContractNote)).toContain('omits a specific representative contract');
    expect(String(summarized._contracts_note)).toContain('7 representative contracts out of 9 unique raw leaders');
  });

  it('builds a ticker-level summary when ticker view is requested', () => {
    const summarized = summarizeMostActiveOptions({
      type: 'ticker',
      index: 'all',
      timestamp: '2026-03-27T05:00:20.797+00:00',
      data: [
        { symbol: 'NVDA', totalVolume: 2000000, putCallRatio: 0.69, atmIV: 0.39 },
        { symbol: 'TSLA', totalVolume: 1800000, putCallRatio: 0.81, atmIV: 0.46 },
      ],
    }) as Record<string, any>;

    expect(summarized.type).toBe('ticker');
    expect(summarized.summary.returnedTickers).toBe(2);
    expect(summarized.summary.topTickerByVolume.symbol).toBe('NVDA');
    expect(summarized.tickers).toHaveLength(2);
  });
});

describe('summarizeShortVolume', () => {
  it('normalizes duplicate percent fields and returns a compact recent summary', () => {
    const summarized = summarizeShortVolume({
      symbol: 'SPY',
      lastUpdate: '2026-03-26',
      latest: {
        date: '20260326',
        shortVolume: 14230658,
        totalVolume: 28086532,
        shortPercent: '50.67',
        shortExemptVolume: 15113,
        markets: ['NYSE', 'NASDAQ', 'ORF'],
      },
      history: [
        { date: '20260326', shortVolume: 14230658, totalVolume: 28086532, shortPercent: '50.67', markets: 'NYSE, NASDAQ, ORF' },
        { date: '20260325', shortVolume: 13187895, totalVolume: 23861246, shortPercentage: '55.27', markets: 'NYSE, NASDAQ, ORF' },
        { date: '20260324', shortVolume: 12239279, totalVolume: 23316554, shortInterestPercentFloat: 52.49, markets: 'NYSE, NASDAQ, ORF' },
      ],
      averages: { avgShortPercentage: '55.13' },
      yearStats: { averageShortPercentage: '55.68' },
    }, 2) as Record<string, any>;

    expect(summarized.latest.shortPercent).toBe(50.67);
    expect(summarized.latest.markets).toEqual(['NYSE', 'NASDAQ', 'ORF']);
    expect(summarized.summary.latestVsTrailingAveragePctPoints).toBeCloseTo(-4.46, 2);
    expect(summarized.summary.recentTrend).toBe('near_average');
    expect(summarized.recentHistory).toHaveLength(2);
    expect(String(summarized._recent_history_note)).toContain('2 most recent sessions out of 3');
  });
});

describe('summarizeShortInterest', () => {
  it('returns a compact biweekly short-interest summary with recent trend context', () => {
    const summarized = summarizeShortInterest({
      symbol: 'SPY',
      lastUpdate: '2026-03-13',
      latest: {
        settlementDate: '20260313',
        shortInterest: 117848132,
        previousShortInterest: 102395225,
        changeNumber: 15452907,
        changePercent: 15.09,
        avgDailyVolume: 93765316,
        daysToCover: 1.26,
      },
      history: [
        { settlementDate: '20260313', shortInterest: 117848132, changePercent: 15.09, avgDailyVolume: 93765316, daysToCover: 1.26 },
        { settlementDate: '20260227', shortInterest: 102395225, changePercent: -15.13, avgDailyVolume: 76590500, daysToCover: 1.34 },
        { settlementDate: '20260213', shortInterest: 120648942, changePercent: 10.17, avgDailyVolume: 92565535, daysToCover: 1.3 },
        { settlementDate: '20260130', shortInterest: 109516152, changePercent: 1.98, avgDailyVolume: 83540222, daysToCover: 1.31 },
      ],
      stats: {
        avgShortInterest: 112602112.75,
        maxShortInterest: 120648942,
        maxDate: '20260213',
        minShortInterest: 102395225,
        minDate: '20260227',
        avgDaysToCover: 1.3,
        periodsAvailable: 4,
      },
    }, 3) as Record<string, any>;

    expect(summarized.latest.shortInterest).toBe(117848132);
    expect(summarized.summary.periodsAvailable).toBe(4);
    expect(summarized.summary.latestVsAveragePct).toBeCloseTo(4.66, 2);
    expect(summarized.summary.recentTrend).toBe('rising');
    expect(summarized.recentHistory).toHaveLength(3);
    expect(String(summarized._recent_history_note)).toContain('3 most recent settlement periods out of 4');
  });

  it('backfills float metadata from company profile and derives shortPercentOfFloat when missing', () => {
    const summarized = summarizeShortInterest({
      symbol: 'AMC',
      lastUpdate: '2026-03-13',
      freeFloat: null,
      sharesOutstanding: null,
      latest: {
        settlementDate: '20260313',
        shortInterest: 118075647,
        previousShortInterest: 124113519,
        changeNumber: -6037872,
        changePercent: -4.86,
        avgDailyVolume: 28478764,
        daysToCover: 4.15,
        shortPercentOfFloat: null,
      },
      history: [
        {
          settlementDate: '20260313',
          shortInterest: 118075647,
          changePercent: -4.86,
          avgDailyVolume: 28478764,
          daysToCover: 4.15,
          shortPercentOfFloat: null,
        },
        {
          settlementDate: '20260227',
          shortInterest: 124113519,
          changePercent: -1.28,
          avgDailyVolume: 29568148,
          daysToCover: 4.2,
          shortPercentOfFloat: null,
        },
      ],
      stats: {
        avgShortInterest: 121094583,
        avgDaysToCover: 4.18,
        periodsAvailable: 2,
      },
    }, 8, {
      free_float_shares: 310000000,
      shares_outstanding: 370000000,
    }) as Record<string, any>;

    expect(summarized.freeFloat).toBe(310000000);
    expect(summarized.sharesOutstanding).toBe(370000000);
    expect(summarized.latest.shortPercentOfFloat).toBeCloseTo(38.09, 2);
    expect(summarized.recentHistory[1].shortPercentOfFloat).toBeCloseTo(40.04, 2);
  });
});
