import test from 'node:test';
import assert from 'node:assert/strict';
import server from './server.mjs';
import { forecastCapacity, detectAnomalies, analyzeLogsNLP, evaluateAutoScalingAction } from './lib/mlEngine.mjs';
import { assessDeploymentRisk, evaluateCanaryTrafficShift, detectConfigurationDrift } from './lib/deploymentSafety.mjs';
import { analyzeCostOptimization } from './lib/costOptimizer.mjs';
import { scanInfrastructureSecurity, analyzeAuditLogs } from './lib/securityScanner.mjs';
import { diagnoseAndSelfHeal } from './lib/incidentEngine.mjs';

test('ML Engine: Capacity Forecasting meets accuracy target (85%+)', () => {
  const history = [30, 32, 35, 34, 38, 40, 42, 45, 48, 50, 52, 55, 58, 60];
  const result = forecastCapacity(history, 30);
  assert.equal(result.predictions.length, 30);
  assert.ok(result.accuracy >= 0.85, `Accuracy should be >= 0.85, got ${result.accuracy}`);
  assert.ok(result.confidence > 0.8);
  assert.equal(result.trend, 'INCREASING');
});

test('ML Engine: Anomaly Detection identifies Z-score spikes', () => {
  const metrics = [
    { timestamp: 1, value: 50, metric: 'cpu' },
    { timestamp: 2, value: 52, metric: 'cpu' },
    { timestamp: 3, value: 49, metric: 'cpu' },
    { timestamp: 4, value: 51, metric: 'cpu' },
    { timestamp: 5, value: 150, metric: 'cpu' },
  ];
  const result = detectAnomalies(metrics, 1.8);
  const anomalies = result.filter((r) => r.isAnomaly);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].value, 150);
});

test('ML Engine: Log NLP extracts root causes', () => {
  const logs = [
    { timestamp: '1', level: 'ERROR', message: 'connection pool exhausted: timeout connecting to db postgresql' },
    { timestamp: '2', level: 'ERROR', message: 'out of memory: heap limit exceeded' },
  ];
  const result = analyzeLogsNLP(logs);
  assert.equal(result.rootCauses.length, 2);
  assert.ok(result.summary.includes('2 errors found'));
});

test('Deployment Safety: Risk Assessment calculates risk level & strategy', () => {
  const commitLow = {
    linesAdded: 20,
    linesDeleted: 5,
    unitTestCoverage: 90,
    hasDatabaseMigration: false,
  };
  const lowResult = assessDeploymentRisk(commitLow);
  assert.equal(lowResult.riskLevel, 'LOW');
  assert.equal(lowResult.dbMigrationSafety.isSafe, true);

  const commitHigh = {
    linesAdded: 1500,
    linesDeleted: 200,
    unitTestCoverage: 60,
    hasDatabaseMigration: true,
    migrationIsDestructive: true,
    criticalPathTouched: true,
  };
  const highResult = assessDeploymentRisk(commitHigh);
  assert.equal(highResult.riskLevel, 'CRITICAL');
  assert.equal(highResult.dbMigrationSafety.isSafe, false);
});

test('Deployment Safety: Canary Traffic Shift triggers rollback on high error rate', () => {
  const canaryState = {
    currentPercent: 25,
    errorRate: 0.02,
    latencyP99Ms: 140,
    latencyBaselineMs: 140,
    targetPercent: 100,
  };
  const result = evaluateCanaryTrafficShift(canaryState);
  assert.equal(result.status, 'ROLLBACK_TRIGGERED');
  assert.equal(result.shouldRollback, true);
  assert.equal(result.currentPercent, 0);
});

test('Cost Optimizer: Achieves 20-30% cost savings target', () => {
  const usage = {
    monthlySpendUsd: 5000,
    activeContainers: 20,
    avgCpuUtilization: 30,
    avgMemoryUtilization: 45,
    spotUsageRatio: 0.1,
  };
  const result = analyzeCostOptimization(usage);
  assert.ok(result.savingsPercentage >= 20 && result.savingsPercentage <= 32, `Savings % should be between 20 and 32, got ${result.savingsPercentage}%`);
  assert.ok(result.monthlySavingsUsd > 0);
  assert.equal(result.recommendations.length, 3);
  assert.equal(result.cloudProviders.length, 3);
});

test('Security Scanner: Detects vulnerabilities & compliance', () => {
  const manifest = { runAsRoot: true, openPorts: [22, 80, 443] };
  const result = scanInfrastructureSecurity(manifest);
  assert.equal(result.vulnerabilities.length, 2);
  assert.equal(result.status, 'WARNING');
});

test('Incident Engine: Diagnoses and creates self-healing actions', () => {
  const input = {
    metrics: [
      { timestamp: 1, value: 50, metric: 'cpu' },
      { timestamp: 2, value: 95, metric: 'cpu' },
    ],
    logs: [
      { timestamp: '1', level: 'ERROR', message: 'out of memory: heap limit exceeded in analytics-worker-v2' },
    ],
    approvalPolicy: 'AUTOMATED_LOW_MEDIUM',
  };
  const result = diagnoseAndSelfHeal(input);
  assert.equal(result.incidentDetected, true);
  assert.ok(result.selfHealingActions.length > 0);
  assert.equal(result.performanceImpact.mttrReductionPercent, 74);
});

test('REST API: Server responds to /health and API endpoints', async () => {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = server.address().port;

  // 1. Test /health
  const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'UP');

  // 2. Test /api/deploy/risk-assessment
  const riskRes = await fetch(`http://127.0.0.1:${port}/api/deploy/risk-assessment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linesAdded: 100, unitTestCoverage: 92 }),
  });
  assert.equal(riskRes.status, 200);
  const riskData = await riskRes.json();
  assert.ok(riskData.riskScore !== undefined);

  // 3. Test /api/capacity/forecast
  const capacityRes = await fetch(`http://127.0.0.1:${port}/api/capacity/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ historicalData: [10, 20, 30, 40, 50] }),
  });
  assert.equal(capacityRes.status, 200);
  const capacityData = await capacityRes.json();
  assert.ok(capacityData.forecast.predictions.length > 0);

  // 4. Test /api/cost/analyze
  const costRes = await fetch(`http://127.0.0.1:${port}/api/cost/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthlySpendUsd: 4000 }),
  });
  assert.equal(costRes.status, 200);
  const costData = await costRes.json();
  assert.ok(costData.monthlySavingsUsd > 0);

  server.close();
});
