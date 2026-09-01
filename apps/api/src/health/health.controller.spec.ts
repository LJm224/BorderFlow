import { HealthController } from './health.controller';
import { expect, test } from 'vitest';

test('returns a healthy API payload', () => {
  const result = new HealthController().getHealth();
  expect(result.status).toBe('ok');
  expect(result.service).toBe('borderflow-api');
});
