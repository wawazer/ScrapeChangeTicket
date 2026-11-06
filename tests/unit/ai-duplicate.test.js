import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuplicatePrompt, fallbackDuplicateCheck, detectDuplicates } from '../../src/ai/duplicate.js';

test('formatDuplicatePrompt formats target and historical list', () => {
  const target = {
    number: 'CTASK001',
    short_description: 'Restart Service Nginx',
    application: 'Web Portal',
    configuration_item: 'SRV-WEB-01',
    description: 'Nginx process high CPU usage',
    requestor: 'John Doe',
    nipp: '12345',
  };
  const history = [
    {
      number: 'CTASK000',
      short_description: 'Nginx CPU Spike',
      application: 'Web Portal',
      configuration_item: 'SRV-WEB-01',
      description: 'Nginx process high memory and CPU',
      state: 'Closed Complete',
    },
  ];

  const prompt = formatDuplicatePrompt(target, history);
  assert.ok(prompt.includes('CTASK001'));
  assert.ok(prompt.includes('Restart Service Nginx'));
  assert.ok(prompt.includes('CTASK000'));
  assert.ok(prompt.includes('STRUCTURAL JSON OUTPUT SCHEMA'));
});

test('fallbackDuplicateCheck finds overlapping keywords', () => {
  const target = {
    number: 'CTASK002',
    description: 'Database connection pool exhausted restart postgresql service',
  };
  const history = [
    {
      number: 'CTASK001',
      description: 'Restart postgresql service due to connection pool exhausted error',
    },
    {
      number: 'CTASK000',
      description: 'Update ssl certificate on router cisco',
    },
  ];

  const result = fallbackDuplicateCheck(target, history);
  assert.equal(result.target_ticket_number, 'CTASK002');
  assert.equal(result.has_duplicates, true);
  assert.ok(result.duplicates.length >= 1);
  assert.equal(result.duplicates[0].ticket_number, 'CTASK001');
  assert.ok(result.duplicates[0].similarity_score >= 0.7);
  assert.equal(result.duplicates[0].match_level, 'HIGH' || 'MEDIUM');
});

test('fallbackDuplicateCheck returns empty duplicates when no match', () => {
  const target = {
    number: 'CTASK005',
    description: 'Printer ink replacement',
  };
  const history = [
    {
      number: 'CTASK004',
      description: 'Database schema migration',
    },
  ];

  const result = fallbackDuplicateCheck(target, history);
  assert.equal(result.has_duplicates, false);
  assert.equal(result.duplicates.length, 0);
});

test('detectDuplicates handles empty historical list gracefully', async () => {
  const target = { number: 'CTASK010' };
  const result = await detectDuplicates(target, []);
  assert.equal(result.has_duplicates, false);
  assert.equal(result.duplicates.length, 0);
});

test('detectDuplicates parses valid LLM JSON response', async () => {
  const mockProvider = {
    chat: async () => JSON.stringify({
      target_ticket_number: 'CTASK100',
      has_duplicates: true,
      duplicates: [
        {
          ticket_number: 'CTASK090',
          similarity_score: 0.88,
          match_level: 'HIGH',
          is_recurring_issue: true,
          reason: 'Permasalahan sama pada service redis.',
        },
      ],
      recommendation: 'Gabungkan tiket dengan CTASK090.',
    }),
  };

  const result = await detectDuplicates({ number: 'CTASK100' }, [{ number: 'CTASK090' }], mockProvider);
  assert.equal(result.has_duplicates, true);
  assert.equal(result.duplicates[0].ticket_number, 'CTASK090');
  assert.equal(result.duplicates[0].similarity_score, 0.88);
  assert.equal(result.duplicates[0].match_level, 'HIGH');
  assert.equal(result.duplicates[0].is_recurring_issue, true);
});

test('detectDuplicates falls back gracefully when LLM fails', async () => {
  const mockProvider = {
    chat: async () => { throw new Error('Provider timeout'); },
  };

  const target = {
    number: 'CTASK200',
    description: 'Kubernetes node disk pressure restart kubelet',
  };
  const history = [
    {
      number: 'CTASK199',
      description: 'Restart kubelet because node disk pressure',
    },
  ];

  const result = await detectDuplicates(target, history, mockProvider);
  assert.equal(result.target_ticket_number, 'CTASK200');
  assert.equal(result.has_duplicates, true);
  assert.equal(result.duplicates[0].ticket_number, 'CTASK199');
});
