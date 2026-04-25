-- Document the units & sign convention of user_risk_snapshots.data so wire
-- consumers (anything that reads the JSONB without going through the
-- TypeScript layer) have an authoritative reference.
COMMENT ON TABLE user_risk_snapshots IS
  'Per-user risk analytics snapshots. data JSONB convention: '
  'var95/var99/cvar95/maxDrawdown/volatility are PERCENT units (e.g., 2.5 = 2.5%); '
  'volatility annualized; var95/var99/cvar95/maxDrawdown are POSITIVE loss '
  'magnitudes (var95=2.5 means a 2.5% loss). sharpeRatio/beta/correlation are '
  'dimensionless. Canonical TS description: '
  'apps/web/src/services/db.ts:RiskSnapshotRecord.';
