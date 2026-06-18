import { describe, expect, it } from 'vitest';

import { AuditTrail } from '../auditTrail';

describe('AuditTrail redaction', () => {
  it('redacts request headers and API keys from API call metadata', () => {
    const auditTrail = new AuditTrail();

    auditTrail.logAPICall(
      'https://horizon.example.test/accounts',
      'GET',
      {
        headers: {
          Authorization: 'Bearer secret-horizon-token',
          'X-Api-Key': 'secret-api-key',
        },
      },
      { status: 200 },
    );

    const [event] = auditTrail.getAPIActivity();
    const metadata = event.metadata as {
      params: { headers: string };
    };

    expect(metadata.params.headers).toBe('[REDACTED]');
    expect(JSON.stringify(event.metadata)).not.toContain('secret-horizon-token');
    expect(JSON.stringify(event.metadata)).not.toContain('secret-api-key');
  });

  it('redacts sensitive request context from error metadata', () => {
    const auditTrail = new AuditTrail();

    auditTrail.logError(new Error('request failed'), {
      options: {
        headers: {
          Authorization: 'Bearer secret-horizon-token',
        },
      },
    });

    const [event] = auditTrail.getErrors();
    const metadata = event.metadata as {
      context: { options: { headers: string } };
    };

    expect(metadata.context.options.headers).toBe('[REDACTED]');
    expect(JSON.stringify(event.metadata)).not.toContain('secret-horizon-token');
  });
});
