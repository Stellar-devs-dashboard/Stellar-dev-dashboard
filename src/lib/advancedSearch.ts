/**
 * Advanced Search and Filtering System
 * Global search functionality across transactions, operations, and contracts
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataType = 'transactions' | 'operations' | 'contracts' | 'accounts';

export type SortDirection = 'asc' | 'desc';

export type SortField = 'timestamp' | 'amount' | 'type' | string;

export interface DateRangeFilter {
  start: number | null;
  end: number | null;
}

export interface AmountRangeFilter {
  min: number | null;
  max: number | null;
}

export interface SearchFilters {
  dateRange: DateRangeFilter;
  assetType: string | null;
  operationType: string | null;
  amountRange: AmountRangeFilter;
  addressFilter: string | null;
  memoFilter: string | null;
  statusFilter: string | null;
  networkFilter: string | null;
}

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
}

export interface SearchQuery {
  text?: string;
  types?: DataType[];
  filters?: Partial<SearchFilters>;
  sort?: Partial<SortOptions>;
  page?: number;
  limit?: number;
}

export interface SearchableItemBase {
  id: string;
  type: DataType;
  data: Record<string, unknown>;
  timestamp: number;
  amount: number | null;
  asset: string | null;
  operationType: string | null;
  address: string | null;
  memo: string | null;
  status: string | null;
  network: string;
  transactionHash?: string;
  fee?: unknown;
  operationCount?: unknown;
  operationId?: unknown;
  sourceAccount?: string;
  contractId?: string;
  contractType?: unknown;
  accountId?: string;
  balance?: unknown;
  sequence?: unknown;
}

export type SearchableItem = SearchableItemBase;

export interface PaginatedResults {
  items: SearchableItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AggregationDateRange {
  earliest: number | null;
  latest: number | null;
}

export interface SearchAggregations {
  typeCounts: Record<string, number>;
  operationTypeCounts: Record<string, number>;
  assetCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  totalAmount: number;
  averageAmount: number;
  dateRange: AggregationDateRange;
}

export interface SearchResult {
  query: SearchQuery;
  results: SearchableItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchTime: number;
  filters: SearchFilters;
  sort: SortOptions;
  aggregations: SearchAggregations;
}

export interface SearchHistoryEntry {
  id: number;
  timestamp: string;
  query: SearchQuery;
  resultCount: number;
}

export interface SavedSearch {
  id: number;
  name: string;
  query: SearchQuery;
  createdAt: string;
  usageCount: number;
}

export interface SearchStatistics {
  indexedItems: number;
  indexedTypes: DataType[];
  searchTerms: number;
  searchHistory: number;
  savedSearches: number;
}

class AdvancedSearchService {
  searchHistory: SearchHistoryEntry[];
  savedSearches: SavedSearch[];
  indexedData: Map<DataType, SearchableItem[]>;
  searchIndex: Map<string, Set<string>>;
  filters: SearchFilters;
  sortOptions: SortOptions;

  constructor() {
    this.searchHistory = [];
    this.savedSearches = [];
    this.indexedData = new Map();
    this.searchIndex = new Map();
    this.filters = {
      dateRange: { start: null, end: null },
      assetType: null,
      operationType: null,
      amountRange: { min: null, max: null },
      addressFilter: null,
      memoFilter: null,
      statusFilter: null,
      networkFilter: null
    };
    this.sortOptions = {
      field: 'timestamp',
      direction: 'desc'
    };
  }

  /**
   * Index data for fast searching
   */
  indexData(type: DataType, data: Record<string, unknown>[]): void {
    if (!Array.isArray(data)) return;

    const indexed = data.map(item => this.createSearchableItem(type, item));
    this.indexedData.set(type, indexed);
    
    // Build search index
    indexed.forEach(item => {
      const terms = this.extractSearchTerms(item);
      terms.forEach(term => {
        if (!this.searchIndex.has(term)) {
          this.searchIndex.set(term, new Set());
        }
        this.searchIndex.get(term)!.add(item.id);
      });
    });
  }

  /**
   * Create searchable item from raw data
   */
  createSearchableItem(type: DataType, item: Record<string, unknown>): SearchableItem {
    const baseItem: SearchableItem = {
      id: `${type}_${String(item.id ?? item.hash ?? item.address ?? '')}`,
      type,
      data: item,
      timestamp: this.extractTimestamp(item),
      amount: this.extractAmount(item),
      asset: this.extractAsset(item),
      operationType: this.extractOperationType(item),
      address: this.extractAddress(item),
      memo: this.extractMemo(item),
      status: this.extractStatus(item),
      network: typeof item.network === 'string' ? item.network : 'unknown'
    };

    // Add type-specific fields
    switch (type) {
      case 'transactions':
        baseItem.transactionHash = item.hash as string | undefined;
        baseItem.fee = item.fee;
        baseItem.operationCount = item.operation_count;
        break;
      case 'operations':
        baseItem.operationId = item.id;
        baseItem.transactionHash = item.transaction_hash as string | undefined;
        baseItem.sourceAccount = item.source_account as string | undefined;
        break;
      case 'contracts':
        baseItem.contractId = (item.contract_id ?? item.id) as string | undefined;
        baseItem.contractType = item.type;
        break;
      case 'accounts':
        baseItem.accountId = (item.account_id ?? item.address) as string | undefined;
        baseItem.balance = item.balance;
        baseItem.sequence = item.sequence;
        break;
    }

    return baseItem;
  }

  /**
   * Extract search terms from item
   */
  extractSearchTerms(item: SearchableItem): string[] {
    const terms = new Set<string>();

    // Add basic fields
    terms.add(item.type.toLowerCase());
    terms.add(item.operationType?.toLowerCase() || '');
    terms.add(item.asset?.toLowerCase() || '');
    terms.add(item.status?.toLowerCase() || '');
    terms.add(item.network?.toLowerCase() || '');

    // Add addresses and hashes
    if (item.address) terms.add(item.address.toLowerCase());
    if (item.transactionHash) terms.add(item.transactionHash.toLowerCase());
    if (item.contractId) terms.add(item.contractId.toLowerCase());
    if (item.accountId) terms.add(item.accountId.toLowerCase());

    // Add memo text
    if (item.memo) {
      terms.add(item.memo.toLowerCase());
      // Split memo into words
      item.memo.toLowerCase().split(/\s+/).forEach(word => {
        if (word.length > 2) terms.add(word);
      });
    }

    // Add amount variations
    if (item.amount !== null) {
      terms.add(item.amount.toString());
      terms.add(item.amount.toFixed(2));
    }

    // Add data-specific terms
    this.extractDataSpecificTerms(item.data, terms);

    return Array.from(terms).filter(term => term.length > 0);
  }

  /**
   * Extract data-specific search terms
   */
  extractDataSpecificTerms(data: Record<string, unknown>, terms: Set<string>): void {
    // Recursively extract string values from nested objects
    const extractStrings = (obj: Record<string, unknown>, prefix = ''): void => {
      Object.entries(obj).forEach(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'string' && value.length > 0) {
          terms.add(value.toLowerCase());
          // Split into words
          value.toLowerCase().split(/\s+/).forEach(word => {
            if (word.length > 2) terms.add(word);
          });
        } else if (typeof value === 'number') {
          terms.add(value.toString());
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extractStrings(value as Record<string, unknown>, fullKey);
        }
      });
    };

    extractStrings(data);
  }

  /**
   * Extract timestamp from item
   */
  extractTimestamp(item: Record<string, unknown>): number {
    if (typeof item.created_at === 'string') return new Date(item.created_at).getTime();
    if (typeof item.timestamp === 'string' || typeof item.timestamp === 'number') {
      return new Date(item.timestamp).getTime();
    }
    if (typeof item.time === 'string' || typeof item.time === 'number') {
      return new Date(item.time).getTime();
    }
    return Date.now();
  }

  /**
   * Extract amount from item
   */
  extractAmount(item: Record<string, unknown>): number | null {
    if (item.amount !== undefined && item.amount !== null) return parseFloat(String(item.amount));
    if (item.starting_balance !== undefined) return parseFloat(String(item.starting_balance));
    if (item.amount_in !== undefined) return parseFloat(String(item.amount_in));
    if (item.amount_out !== undefined) return parseFloat(String(item.amount_out));
    return null;
  }

  /**
   * Extract asset from item
   */
  extractAsset(item: Record<string, unknown>): string | null {
    if (typeof item.asset_code === 'string') return item.asset_code;
    if (item.asset_type === 'native') return 'XLM';
    if (typeof item.asset_code === 'string' && typeof item.asset_issuer === 'string') {
      return `${item.asset_code}:${item.asset_issuer}`;
    }
    return null;
  }

  /**
   * Extract operation type from item
   */
  extractOperationType(item: Record<string, unknown>): string | null {
    if (typeof item.type === 'string') return item.type;
    if (typeof item.operation_type === 'number') {
      return this.getOperationTypeName(item.operation_type);
    }
    return null;
  }

  /**
   * Get operation type name from code
   */
  getOperationTypeName(code: number): string {
    const types: Record<number, string> = {
      0: 'payment',
      1: 'create_account',
      2: 'manage_offer',
      3: 'set_options',
      4: 'change_trust',
      5: 'allow_trust',
      6: 'account_merge',
      7: 'inflation',
      8: 'manage_data',
      9: 'bump_sequence',
      10: 'create_claimable_balance',
      11: 'claim_claimable_balance',
      12: 'begin_sponsoring_future_reserves',
      13: 'end_sponsoring_future_reserves',
      14: 'revoke_sponsorship'
    };
    return types[code] || 'unknown';
  }

  /**
   * Extract address from item
   */
  extractAddress(item: Record<string, unknown>): string | null {
    if (typeof item.account_id === 'string') return item.account_id;
    if (typeof item.source_account === 'string') return item.source_account;
    if (typeof item.destination_account === 'string') return item.destination_account;
    if (typeof item.address === 'string') return item.address;
    return null;
  }

  /**
   * Extract memo from item
   */
  extractMemo(item: Record<string, unknown>): string | null {
    if (typeof item.memo === 'string') return item.memo;
    if (item.memo_type && item.memo_value) {
      if (item.memo_type === 'text') return String(item.memo_value);
      if (item.memo_type === 'id') return String(item.memo_value);
    }
    return null;
  }

  /**
   * Extract status from item
   */
  extractStatus(item: Record<string, unknown>): string | null {
    if (typeof item.status === 'string') return item.status;
    if (item.successful !== undefined) return item.successful ? 'success' : 'failed';
    if (item.result_successful !== undefined) return item.result_successful ? 'success' : 'failed';
    return null;
  }

  /**
   * Perform global search
   */
  search(query: SearchQuery): SearchResult {
    const startTime = Date.now();
    
    try {
      // Update filters if provided
      if (query.filters) {
        this.filters = { ...this.filters, ...query.filters };
      }

      // Update sort options if provided
      if (query.sort) {
        this.sortOptions = { ...this.sortOptions, ...query.sort };
      }

      // Get all indexed data
      let results: SearchableItem[] = [];
      this.indexedData.forEach((items, type) => {
        if (!query.types || query.types.includes(type)) {
          results.push(...items);
        }
      });

      // Apply text search
      if (query.text && query.text.trim()) {
        results = this.applyTextSearch(results, query.text.trim());
      }

      // Apply filters
      results = this.applyFilters(results);

      // Apply sorting
      results = this.applySorting(results);

      // Apply pagination
      const paginatedResults = this.applyPagination(results, query.page, query.limit);

      // Add to search history
      this.addToSearchHistory(query);

      const searchTime = Date.now() - startTime;

      return {
        query,
        results: paginatedResults.items,
        total: paginatedResults.total,
        page: paginatedResults.page,
        limit: paginatedResults.limit,
        totalPages: paginatedResults.totalPages,
        searchTime,
        filters: { ...this.filters },
        sort: { ...this.sortOptions },
        aggregations: this.calculateAggregations(results)
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Search failed: ${message}`);
    }
  }

  /**
   * Apply text search to results
   */
  applyTextSearch(results: SearchableItem[], searchText: string): SearchableItem[] {
    const searchTerms = searchText.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return results;

    return results.filter(item => {
      return searchTerms.every(term => {
        // Check if any search term matches the item
        return this.itemContainsTerm(item, term);
      });
    });
  }

  /**
   * Check if item contains search term
   */
  itemContainsTerm(item: SearchableItem, term: string): boolean {
    // Check basic fields
    if (item.type?.toLowerCase().includes(term)) return true;
    if (item.operationType?.toLowerCase().includes(term)) return true;
    if (item.asset?.toLowerCase().includes(term)) return true;
    if (item.status?.toLowerCase().includes(term)) return true;
    if (item.address?.toLowerCase().includes(term)) return true;
    if (item.memo?.toLowerCase().includes(term)) return true;

    // Check hashes and IDs
    if (item.transactionHash?.toLowerCase().includes(term)) return true;
    if (item.contractId?.toLowerCase().includes(term)) return true;
    if (item.accountId?.toLowerCase().includes(term)) return true;

    // Check numeric values
    if (item.amount?.toString().includes(term)) return true;

    // Check search index for exact matches
    const indexedItems = this.searchIndex.get(term.toLowerCase());
    if (indexedItems && indexedItems.has(item.id)) return true;

    return false;
  }

  /**
   * Apply filters to results
   */
  applyFilters(results: SearchableItem[]): SearchableItem[] {
    return results.filter(item => {
      // Date range filter
      if (this.filters.dateRange.start !== null && item.timestamp < this.filters.dateRange.start) {
        return false;
      }
      if (this.filters.dateRange.end !== null && item.timestamp > this.filters.dateRange.end) {
        return false;
      }

      // Asset type filter
      if (this.filters.assetType && item.asset !== this.filters.assetType) {
        return false;
      }

      // Operation type filter
      if (this.filters.operationType && item.operationType !== this.filters.operationType) {
        return false;
      }

      // Amount range filter
      if (this.filters.amountRange.min !== null && (item.amount === null || item.amount < this.filters.amountRange.min)) {
        return false;
      }
      if (this.filters.amountRange.max !== null && (item.amount === null || item.amount > this.filters.amountRange.max)) {
        return false;
      }

      // Address filter
      if (this.filters.addressFilter && !item.address?.includes(this.filters.addressFilter)) {
        return false;
      }

      // Memo filter
      if (this.filters.memoFilter && !item.memo?.toLowerCase().includes(this.filters.memoFilter.toLowerCase())) {
        return false;
      }

      // Status filter
      if (this.filters.statusFilter && item.status !== this.filters.statusFilter) {
        return false;
      }

      // Network filter
      if (this.filters.networkFilter && item.network !== this.filters.networkFilter) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply sorting to results
   */
  applySorting(results: SearchableItem[]): SearchableItem[] {
    const { field, direction } = this.sortOptions;
    
    return results.sort((a, b) => {
      let aValue: string | number = a[field as keyof SearchableItem] as string | number;
      let bValue: string | number = b[field as keyof SearchableItem] as string | number;

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      // Compare based on type
      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Apply pagination to results
   */
  applyPagination(results: SearchableItem[], page = 1, limit = 20): PaginatedResults {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      items: results.slice(startIndex, endIndex),
      total: results.length,
      page,
      limit,
      totalPages: Math.ceil(results.length / limit)
    };
  }

  /**
   * Calculate aggregations for results
   */
  calculateAggregations(results: SearchableItem[]): SearchAggregations {
    const aggregations: SearchAggregations = {
      typeCounts: {},
      operationTypeCounts: {},
      assetCounts: {},
      statusCounts: {},
      totalAmount: 0,
      averageAmount: 0,
      dateRange: { earliest: null, latest: null }
    };

    results.forEach(item => {
      // Type counts
      aggregations.typeCounts[item.type] = (aggregations.typeCounts[item.type] || 0) + 1;

      // Operation type counts
      if (item.operationType) {
        aggregations.operationTypeCounts[item.operationType] = 
          (aggregations.operationTypeCounts[item.operationType] || 0) + 1;
      }

      // Asset counts
      if (item.asset) {
        aggregations.assetCounts[item.asset] = (aggregations.assetCounts[item.asset] || 0) + 1;
      }

      // Status counts
      if (item.status) {
        aggregations.statusCounts[item.status] = (aggregations.statusCounts[item.status] || 0) + 1;
      }

      // Amount aggregations
      if (item.amount !== null) {
        aggregations.totalAmount += item.amount;
      }

      // Date range
      if (item.timestamp) {
        if (aggregations.dateRange.earliest === null || item.timestamp < aggregations.dateRange.earliest) {
          aggregations.dateRange.earliest = item.timestamp;
        }
        if (aggregations.dateRange.latest === null || item.timestamp > aggregations.dateRange.latest) {
          aggregations.dateRange.latest = item.timestamp;
        }
      }
    });

    // Calculate average amount
    const amountCount = results.filter(item => item.amount !== null).length;
    aggregations.averageAmount = amountCount > 0 ? aggregations.totalAmount / amountCount : 0;

    return aggregations;
  }

  /**
   * Add search to history
   */
  addToSearchHistory(query: SearchQuery): void {
    const historyEntry: SearchHistoryEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      query: { ...query },
      resultCount: this.searchIndex.size
    };

    this.searchHistory.unshift(historyEntry);
    
    // Keep only last 50 searches
    if (this.searchHistory.length > 50) {
      this.searchHistory = this.searchHistory.slice(0, 50);
    }
  }

  /**
   * Save search for later use
   */
  saveSearch(name: string, query: SearchQuery): void {
    const savedSearch: SavedSearch = {
      id: Date.now(),
      name,
      query: { ...query },
      createdAt: new Date().toISOString(),
      usageCount: 0
    };

    this.savedSearches.push(savedSearch);
  }

  /**
   * Get saved searches
   */
  getSavedSearches(): SavedSearch[] {
    return this.savedSearches.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Get search history
   */
  getSearchHistory(): SearchHistoryEntry[] {
    return [...this.searchHistory];
  }

  /**
   * Get search suggestions
   */
  getSuggestions(partial: string): string[] {
    if (!partial || partial.length < 2) return [];

    const suggestions = new Set<string>();
    const lowerPartial = partial.toLowerCase();

    // Find matching terms from search index
    this.searchIndex.forEach((_items, term) => {
      if (term.includes(lowerPartial)) {
        suggestions.add(term);
      }
    });

    // Add common operation types
    const operationTypes = ['payment', 'create_account', 'manage_offer', 'set_options', 'change_trust'];
    operationTypes.forEach(type => {
      if (type.includes(lowerPartial)) {
        suggestions.add(type);
      }
    });

    // Add common assets
    const commonAssets = ['XLM', 'USDC', 'BTC', 'ETH', 'USDT'];
    commonAssets.forEach(asset => {
      if (asset.toLowerCase().includes(lowerPartial)) {
        suggestions.add(asset);
      }
    });

    return Array.from(suggestions).slice(0, 10);
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = [];
  }

  /**
   * Reset all filters
   */
  resetFilters(): void {
    this.filters = {
      dateRange: { start: null, end: null },
      assetType: null,
      operationType: null,
      amountRange: { min: null, max: null },
      addressFilter: null,
      memoFilter: null,
      statusFilter: null,
      networkFilter: null
    };
  }

  /**
   * Get current filters
   */
  getFilters(): SearchFilters {
    return { ...this.filters };
  }

  /**
   * Get search statistics
   */
  getStatistics(): SearchStatistics {
    return {
      indexedItems: Array.from(this.indexedData.values()).reduce((total, items) => total + items.length, 0),
      indexedTypes: Array.from(this.indexedData.keys()),
      searchTerms: this.searchIndex.size,
      searchHistory: this.searchHistory.length,
      savedSearches: this.savedSearches.length
    };
  }
}

// Create singleton instance
const advancedSearchService = new AdvancedSearchService();

export default advancedSearchService;
export { AdvancedSearchService };
