/**
 * Advanced Rate Limiting and Request Queuing System
 * Implements token bucket algorithm with intelligent request batching and queue management
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThrottleMode = 'aggressive' | 'conservative';
export type RequestPriority = 'high' | 'medium' | 'low';
export type EndpointName = 'accounts' | 'transactions' | 'operations' | 'assets' | 'contracts' | 'default';

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  batchSize?: number;
  batchTimeout?: number;
  throttleMode?: ThrottleMode;
  maxQueueSize?: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  endpointUsage?: Map<string, number>;
}

export interface QueuedRequestPayload {
  url: string;
  options?: RequestInit;
  priority?: RequestPriority;
  maxRetries?: number;
  method?: string;
}

export interface QueuedRequest {
  id: string;
  request: QueuedRequestPayload;
  identifier: string;
  timestamp: number;
  resolve: ((value: Response) => void) | null;
  reject: ((reason?: unknown) => void) | null;
  priority: RequestPriority;
  endpoint: EndpointName;
  retryCount: number;
  maxRetries: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetTime?: number;
  retryAfter?: number;
  endpointLimited?: boolean;
}

export interface RateLimiterStatistics {
  totalRequests: number;
  queuedRequests: number;
  batchedRequests: number;
  rejectedRequests: number;
  droppedRequests: number;
  averageResponseTime: number;
  endpointUsage: Map<string, number>;
}

export interface RateLimiterStatus {
  remaining: number;
  limit: number;
  resetTime: number;
  endpointUsage: Record<string, number>;
}

export interface BatchResult {
  success: boolean;
  response?: Response;
  error?: unknown;
  request: QueuedRequestPayload;
}

export interface RateLimiterStatsSnapshot extends RateLimiterStatistics {
  queueSizes: Record<RequestPriority, number>;
  totalQueued: number;
  activeBuckets: number;
  throttleMode: ThrottleMode;
  maxQueueSize: number;
  timestamp: number;
}

type PriorityQueues = Record<RequestPriority, QueuedRequest[]>;

class RateLimiter {
  windowMs: number;
  maxRequests: number;
  buckets: Map<string, TokenBucket>;
  requestQueue: Map<string, QueuedRequest[]>;
  batchSize: number;
  batchTimeout: number;
  throttleMode: ThrottleMode;
  maxQueueSize: number;
  priorityQueues: PriorityQueues;
  cleanupInterval: ReturnType<typeof setInterval>;
  processingInterval: ReturnType<typeof setInterval>;
  statistics: RateLimiterStatistics;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs || 60000; // Default: 1 minute
    this.maxRequests = options.maxRequests || 30; // Default: 30 requests per minute
    this.buckets = new Map(); // Store tokens per user/IP
    this.requestQueue = new Map(); // Request queues per endpoint type
    this.batchSize = options.batchSize || 10; // Max batch size for request batching
    this.batchTimeout = options.batchTimeout || 100; // Max wait time for batching (ms)
    this.throttleMode = options.throttleMode || 'aggressive'; // 'aggressive' | 'conservative'
    this.maxQueueSize = options.maxQueueSize || 100; // Maximum items in queue before dropping
    this.priorityQueues = {
      high: [],
      medium: [],
      low: []
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.processingInterval = setInterval(() => this.processQueues(), 50);
    this.statistics = {
      totalRequests: 0,
      queuedRequests: 0,
      batchedRequests: 0,
      rejectedRequests: 0,
      droppedRequests: 0,
      averageResponseTime: 0,
      endpointUsage: new Map()
    };
  }

  /**
   * Check if request is allowed
   */
  check(identifier: string): RateLimitCheckResult {
    const now = Date.now();
    let bucket = this.buckets.get(identifier);
    
    if (!bucket) {
      // Create new bucket
      bucket = {
        tokens: this.maxRequests - 1,
        lastRefill: now,
      };
      this.buckets.set(identifier, bucket);
      
      return {
        allowed: true,
        remaining: bucket.tokens,
        resetTime: now + this.windowMs,
      };
    }
    
    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor(elapsed / this.windowMs) * this.maxRequests;
    
    if (refillAmount > 0) {
      bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }
    
    // Check if request is allowed
    if (bucket.tokens > 0) {
      bucket.tokens--;
      
      return {
        allowed: true,
        remaining: bucket.tokens,
        resetTime: bucket.lastRefill + this.windowMs,
      };
    }
    
    // Rate limited
    const resetTime = bucket.lastRefill + this.windowMs;
    const retryAfter = Math.ceil((resetTime - now) / 1000);
    
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      retryAfter,
    };
  }

  /**
   * Get remaining requests for identifier
   */
  getRemaining(identifier: string): number {
    const bucket = this.buckets.get(identifier);
    if (!bucket) return this.maxRequests;
    return bucket.tokens;
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier: string): void {
    this.buckets.delete(identifier);
  }

  /**
   * Queue a request if rate limited
   */
  async queueRequest(request: QueuedRequestPayload, identifier = 'default'): Promise<Response> {
    const requestId = this.generateRequestId();
    const queuedRequest: QueuedRequest = {
      id: requestId,
      request,
      identifier,
      timestamp: Date.now(),
      resolve: null,
      reject: null,
      priority: request.priority || 'medium',
      endpoint: this.extractEndpoint(request.url),
      retryCount: 0,
      maxRetries: request.maxRetries || 3
    };

    return new Promise<Response>((resolve, reject) => {
      queuedRequest.resolve = resolve;
      queuedRequest.reject = reject;
      
      // Check if queue is full (conservative mode)
      if (this.throttleMode === 'conservative') {
        const totalQueued = this.priorityQueues.high.length + 
                           this.priorityQueues.medium.length + 
                           this.priorityQueues.low.length;
        
        if (totalQueued >= this.maxQueueSize) {
          // Drop request in conservative mode if queue is full
          this.statistics.droppedRequests++;
          reject(new Error('Request dropped: queue overflow in conservative mode'));
          return;
        }
      }
      
      // Add to appropriate priority queue
      this.priorityQueues[queuedRequest.priority].push(queuedRequest);
      this.statistics.queuedRequests++;
      
      // Try to process immediately if possible
      this.processRequest(queuedRequest);
    });
  }

  /**
   * Process queued requests based on rate limits
   */
  processQueues(): void {
    // Process high priority first, then medium, then low
    (['high', 'medium', 'low'] as RequestPriority[]).forEach(priority => {
      const queue = this.priorityQueues[priority];
      while (queue.length > 0) {
        const request = queue[0];
        if (this.processRequest(request)) {
          queue.shift(); // Remove from queue if processed
        } else {
          break; // Can't process more requests of this priority
        }
      }
    });
  }

  /**
   * Process a single request if rate limits allow
   */
  processRequest(queuedRequest: QueuedRequest): boolean {
    const check = this.checkRequest(queuedRequest.identifier, queuedRequest.endpoint);
    
    if (check.allowed) {
      // Execute the request
      void this.executeRequest(queuedRequest);
      return true;
    } else if (Date.now() - queuedRequest.timestamp > 30000) {
      // Request has been waiting too long, reject it
      queuedRequest.reject?.(new Error('Request timed out in queue'));
      this.statistics.rejectedRequests++;
      return true;
    }
    
    return false; // Still rate limited
  }

  /**
   * Execute a queued request
   */
  async executeRequest(queuedRequest: QueuedRequest): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update statistics
      this.statistics.totalRequests++;
      this.updateEndpointUsage(queuedRequest.endpoint);
      
      // Execute the actual request
      const response = await fetch(queuedRequest.request.url, queuedRequest.request.options);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);
      
      // Resolve with response
      queuedRequest.resolve?.(response);
      
    } catch (error) {
      // Retry logic
      if (queuedRequest.retryCount < queuedRequest.maxRetries) {
        queuedRequest.retryCount++;
        queuedRequest.timestamp = Date.now();
        
        // Add back to queue with lower priority
        const retryPriority: RequestPriority = queuedRequest.priority === 'high' ? 'medium' : 'low';
        this.priorityQueues[retryPriority].push(queuedRequest);
      } else {
        queuedRequest.reject?.(error);
        this.statistics.rejectedRequests++;
      }
    }
  }

  /**
   * Batch similar requests together
   */
  async batchRequests(requests: QueuedRequestPayload[]): Promise<BatchResult[]> {
    if (requests.length === 0) return [];
    
    // Group requests by endpoint and method
    const batches = new Map<string, QueuedRequestPayload[]>();
    
    requests.forEach(request => {
      const key = `${request.method || 'GET'}:${this.extractEndpoint(request.url)}`;
      if (!batches.has(key)) {
        batches.set(key, []);
      }
      batches.get(key)!.push(request);
    });
    
    // Execute batches in parallel
    const batchPromises = Array.from(batches.values()).map(batch => 
      this.executeBatch(batch)
    );
    
    const results = await Promise.all(batchPromises);
    return results.flat();
  }

  /**
   * Execute a batch of requests
   */
  async executeBatch(batch: QueuedRequestPayload[]): Promise<BatchResult[]> {
    // For now, execute requests in parallel with a small delay
    // In a real implementation, this could use GraphQL batching or custom endpoints
    const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    
    const promises = batch.map(async (request, index): Promise<BatchResult> => {
      if (index > 0) {
        await delay(10); // Small delay between requests
      }
      
      try {
        const response = await fetch(request.url, request.options);
        return { success: true, response, request };
      } catch (error) {
        return { success: false, error, request };
      }
    });
    
    const results = await Promise.all(promises);
    this.statistics.batchedRequests += batch.length;
    
    return results;
  }

  /**
   * Check if request is allowed for specific endpoint
   */
  checkRequest(identifier: string, endpoint: EndpointName): RateLimitCheckResult {
    const now = Date.now();
    let bucket = this.buckets.get(identifier);
    
    if (!bucket) {
      bucket = {
        tokens: this.maxRequests - 1,
        lastRefill: now,
        endpointUsage: new Map()
      };
      this.buckets.set(identifier, bucket);
      return { allowed: true, remaining: bucket.tokens };
    }
    
    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor(elapsed / this.windowMs) * this.maxRequests;
    
    if (refillAmount > 0) {
      bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }
    
    // Check endpoint-specific limits
    const endpointUsageMap = bucket.endpointUsage ?? new Map<string, number>();
    if (!bucket.endpointUsage) {
      bucket.endpointUsage = endpointUsageMap;
    }
    const endpointUsage = endpointUsageMap.get(endpoint) || 0;
    const endpointLimit = this.getEndpointLimit(endpoint);
    
    if (endpointUsage >= endpointLimit) {
      return { allowed: false, remaining: bucket.tokens, endpointLimited: true };
    }
    
    // In conservative mode, reduce concurrent parallelism
    if (this.throttleMode === 'conservative') {
      // Only allow 1/3 of normal throughput in conservative mode
      const conservativeLimit = Math.ceil(this.maxRequests / 3);
      if (bucket.tokens > conservativeLimit) {
        bucket.tokens = conservativeLimit;
      }
    }
    
    // Check if request is allowed
    if (bucket.tokens > 0) {
      bucket.tokens--;
      endpointUsageMap.set(endpoint, endpointUsage + 1);
      return { allowed: true, remaining: bucket.tokens };
    }
    
    return { allowed: false, remaining: 0 };
  }

  /**
   * Get rate limit for specific endpoint
   */
  getEndpointLimit(endpoint: EndpointName): number {
    const limits: Record<EndpointName, number> = {
      'accounts': 20,
      'transactions': 15,
      'operations': 25,
      'assets': 10,
      'contracts': 5,
      'default': 30
    };
    
    return limits[endpoint] ?? limits.default;
  }

  /**
   * Extract endpoint from URL
   */
  extractEndpoint(url: string): EndpointName {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      if (path.includes('/accounts')) return 'accounts';
      if (path.includes('/transactions')) return 'transactions';
      if (path.includes('/operations')) return 'operations';
      if (path.includes('/assets')) return 'assets';
      if (path.includes('/contracts')) return 'contracts';
      
      return 'default';
    } catch {
      return 'default';
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update endpoint usage statistics
   */
  updateEndpointUsage(endpoint: EndpointName): void {
    const current = this.statistics.endpointUsage.get(endpoint) || 0;
    this.statistics.endpointUsage.set(endpoint, current + 1);
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(responseTime: number): void {
    const total = this.statistics.totalRequests;
    const current = this.statistics.averageResponseTime;
    this.statistics.averageResponseTime = (current * (total - 1) + responseTime) / total;
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics(): RateLimiterStatsSnapshot {
    return {
      ...this.statistics,
      queueSizes: {
        high: this.priorityQueues.high.length,
        medium: this.priorityQueues.medium.length,
        low: this.priorityQueues.low.length
      },
      totalQueued: this.priorityQueues.high.length + 
                   this.priorityQueues.medium.length + 
                   this.priorityQueues.low.length,
      activeBuckets: this.buckets.size,
      throttleMode: this.throttleMode,
      maxQueueSize: this.maxQueueSize,
      timestamp: Date.now()
    };
  }

  /**
   * Clean up expired buckets (older than windowMs)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [identifier, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > this.windowMs * 2) {
        this.buckets.delete(identifier);
      }
    }
    
    // Clean up old queued requests (older than 5 minutes)
    Object.values(this.priorityQueues).forEach(queue => {
      const validRequests = queue.filter(req => now - req.timestamp < 300000);
      queue.length = 0;
      queue.push(...validRequests);
    });
  }

  /**
   * Get rate limit status
   */
  getStatus(identifier: string): RateLimiterStatus {
    const bucket = this.buckets.get(identifier);
    if (!bucket) {
      return {
        remaining: this.maxRequests,
        limit: this.maxRequests,
        resetTime: Date.now() + this.windowMs,
        endpointUsage: {}
      };
    }
    
    return {
      remaining: bucket.tokens,
      limit: this.maxRequests,
      resetTime: bucket.lastRefill + this.windowMs,
      endpointUsage: Object.fromEntries(bucket.endpointUsage ?? new Map())
    };
  }

  /**
   * Set throttle mode
   */
  setThrottleMode(mode: ThrottleMode): void {
    if (mode === 'aggressive' || mode === 'conservative') {
      this.throttleMode = mode;
    }
  }

  /**
   * Get current throttle mode
   */
  getThrottleMode(): ThrottleMode {
    return this.throttleMode;
  }
}

// Create default rate limiter instance
const rateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 30,
});

// Create stricter rate limiter for expensive operations
const strictRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 10,
});

// Create very strict rate limiter for write operations
const writeRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 5,
});

export default rateLimiter;
export { rateLimiter, strictRateLimiter, writeRateLimiter, RateLimiter };
