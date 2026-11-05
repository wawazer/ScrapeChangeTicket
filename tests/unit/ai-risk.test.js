import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleBasedRisk, scoreToLabel, suggestMitigations } from '../../src/ai/risk.js';
import { extractJson } from '../../src/ai/provider.js';

test('ruleBasedRisk: returns medium baseline for empty text', () => {
  const result = ruleBasedRisk('');
  assert.equal(result.score, 30);
  assert.deepEqual(result.factors, []);
});

test('ruleBasedRisk: detects high-impact keywords and boosts score', () => {
  const result = ruleBasedRisk('This is a production migration that may cause downtime');
  assert.ok(result.score >= 70, `score ${result.score} should be >= 70`);
  assert.ok(result.factors.includes('production'));
  assert.ok(result.factors.includes('downtime'));
  assert.ok(result.factors.includes('migration'));
});

test('ruleBasedRisk: detects medium-risk keywords', () => {
  const result = ruleBasedRisk('Deploy to staging for performance tuning');
  assert.ok(result.factors.includes('staging'));
  assert.ok(result.factors.includes('performance'));
  assert.ok(result.factors.includes('deploy'));
});

test('ruleBasedRisk: detects low-risk keywords and reduces score', () => {
  const result = ruleBasedRisk('Minor fix for a typo in documentation');
  assert.ok(result.factors.includes('minor'));
  assert.ok(result.factors.includes('typo'));
  assert.ok(result.factors.includes('documentation'));
  assert.ok(result.score < 50, `score ${result.score} should be < 50`);
});

test('scoreToLabel: maps numeric ranges to labels', () => {
  assert.equal(scoreToLabel(85), 'high');
  assert.equal(scoreToLabel(70), 'high');
  assert.equal(scoreToLabel(69), 'medium');
  assert.equal(scoreToLabel(40), 'medium');
  assert.equal(scoreToLabel(39), 'low');
  assert.equal(scoreToLabel(0), 'low');
});

test('suggestMitigations: returns targeted advice for known factors', () => {
  const m = suggestMitigations(['downtime', 'production']);
  assert.ok(m.some((s) => s.includes('maintenance window')));
  assert.ok(m.some((s) => s.includes('stakeholder')));
});

test('suggestMitigations: returns fallback when no high-risk factors', () => {
  const m = suggestMitigations(['typo']);
  assert.deepEqual(m, ['Lakukan standard change review']);
});

test('extractJson: unwraps markdown code fences', () => {
  const raw = '```json\n{"summary":"test","riskLevel":"medium"}\n```';
  const json = extractJson(raw);
  assert.equal(json, '{"summary":"test","riskLevel":"medium"}');
});

test('extractJson: extracts bare JSON from surrounding text', () => {
  const raw = 'Here is the result: {"riskScore":42} end.';
  const json = extractJson(raw);
  assert.equal(json, '{"riskScore":42}');
});

test('extractJson: returns null when no JSON present', () => {
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(''), null);
});
