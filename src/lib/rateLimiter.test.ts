import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token bucket algorithm', () => {
    it('should refill tokens continuously based on elapsed time', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 10 });
      
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        expect(limiter.check('user1').allowed).toBe(true);
      }
      expect(limiter.check('user1').allowed).toBe(false);

      // Advance time by 500ms (half window) - should refill 5 tokens
      vi.advanceTimersByTime(500);

      for (let i = 0; i < 5; i++) {
        expect(limiter.check('user1').allowed).toBe(true);
      }
      expect(limiter.check('user1').allowed).toBe(false);
    });

    it('should handle burst behavior correctly', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 10 });
      
      // Burst 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.check('user2').allowed).toBe(true);
      }
      // 11th should fail
      expect(limiter.check('user2').allowed).toBe(false);
    });

    it('should handle window rollover and respect max capacity', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 10 });
      
      // Consume 5 tokens
      for (let i = 0; i < 5; i++) {
        expect(limiter.check('user3').allowed).toBe(true);
      }

      // Advance time by 2000ms (2 windows)
      vi.advanceTimersByTime(2000);

      // Should have 10 tokens, not 25
      for (let i = 0; i < 10; i++) {
        expect(limiter.check('user3').allowed).toBe(true);
      }
      expect(limiter.check('user3').allowed).toBe(false);
    });
  });

  describe('Multi-endpoint limits', () => {
    it('should respect specific endpoint limits', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 30 });
      
      // 'contracts' endpoint has a limit of 5
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkRequest('user4', 'contracts').allowed).toBe(true);
      }
      // 6th should fail
      expect(limiter.checkRequest('user4', 'contracts').allowed).toBe(false);
    });

    it('should reset endpoint usage on window expiry', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 30 });
      
      // 'contracts' limit is 5
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkRequest('user5', 'contracts').allowed).toBe(true);
      }
      expect(limiter.checkRequest('user5', 'contracts').allowed).toBe(false);

      // Advance time by full window
      vi.advanceTimersByTime(1000);

      // Should be allowed again
      expect(limiter.checkRequest('user5', 'contracts').allowed).toBe(true);
    });
  });

  describe('Queue processing', () => {
    it('should process queue in an event-driven way without polling', async () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 1 });
      
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      // First request should be executed immediately
      const req1 = limiter.queueRequest({ url: 'https://api.example.com/test1' }, 'user6');
      
      // Second request should be queued
      const req2 = limiter.queueRequest({ url: 'https://api.example.com/test2' }, 'user6');
      
      // The second request shouldn't resolve yet
      let resolved = false;
      req2.then(() => { resolved = true; });
      
      // Wait for event loop to clear microtasks
      await Promise.resolve();
      expect(resolved).toBe(false);
      
      // Advance time to refill token and trigger processing
      vi.advanceTimersByTime(1000);
      
      // Give promises time to resolve
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Now it should be resolved
      expect(resolved).toBe(true);
    });
  });
});
