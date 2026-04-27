import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/storage', () => ({
  getStoredValue: vi.fn().mockResolvedValue(null),
  setStoredValue: vi.fn(),
}));
vi.mock('../../../src/utils/stateSync', () => ({
  broadcastStateChange: vi.fn(),
  onStateChange: vi.fn(),
}));

import { useStore } from '../../../src/lib/store';

describe('useStore', () => {
  beforeEach(() => {
    useStore.setState({
      network: 'testnet',
      connectedAddress: null,
      accountData: null,
      accountLoading: false,
      accountError: null,
      transactions: [],
      operations: [],
      activeTab: 'overview',
      notifications: [],
      walletConnected: false,
      walletType: null,
      walletPublicKey: null,
      comparisonSlots: [
        { key: '', data: null, loading: false, error: null },
        { key: '', data: null, loading: false, error: null },
        { key: '', data: null, loading: false, error: null },
      ],
    }, false); // false = merge, preserves action functions
  });

  // ─── Network ───────────────────────────────────────────────────────────────

  it('setNetwork clears account and transaction state', () => {
    useStore.setState({ transactions: [{ id: '1' }], accountData: { id: 'G...' } }, false);
    useStore.getState().setNetwork('mainnet');
    const state = useStore.getState();
    expect(state.network).toBe('mainnet');
    expect(state.transactions).toHaveLength(0);
    expect(state.accountData).toBeNull();
  });

  // ─── Account ───────────────────────────────────────────────────────────────

  it('setConnectedAddress updates connectedAddress', () => {
    useStore.getState().setConnectedAddress('GABC');
    expect(useStore.getState().connectedAddress).toBe('GABC');
  });

  it('setAccountData clears accountError', () => {
    useStore.setState({ accountError: 'old error' }, false);
    useStore.getState().setAccountData({ id: 'G...' });
    expect(useStore.getState().accountError).toBeNull();
  });

  // ─── Transactions ──────────────────────────────────────────────────────────

  it('appendTransactions deduplicates by id', () => {
    useStore.getState().setTransactions([{ id: 'tx1' }, { id: 'tx2' }]);
    useStore.getState().appendTransactions([{ id: 'tx2' }, { id: 'tx3' }]);
    expect(useStore.getState().transactions).toHaveLength(3);
  });

  // ─── Active tab ────────────────────────────────────────────────────────────

  it('setActiveTab updates activeTab', () => {
    useStore.getState().setActiveTab('multisig');
    expect(useStore.getState().activeTab).toBe('multisig');
  });

  // ─── Wallet ────────────────────────────────────────────────────────────────

  it('setWalletConnected stores wallet info', () => {
    useStore.getState().setWalletConnected(true, 'freighter', 'GPUB');
    const { walletConnected, walletType, walletPublicKey } = useStore.getState();
    expect(walletConnected).toBe(true);
    expect(walletType).toBe('freighter');
    expect(walletPublicKey).toBe('GPUB');
  });

  it('disconnectWallet clears wallet state', () => {
    useStore.getState().setWalletConnected(true, 'freighter', 'GPUB');
    useStore.getState().disconnectWallet();
    const { walletConnected, walletType, walletPublicKey } = useStore.getState();
    expect(walletConnected).toBe(false);
    expect(walletType).toBeNull();
    expect(walletPublicKey).toBeNull();
  });

  // ─── Notifications ─────────────────────────────────────────────────────────

  it('addNotification appends to list', () => {
    useStore.getState().addNotification({ id: 'n1', type: 'success', title: 'Done' });
    expect(useStore.getState().notifications).toHaveLength(1);
  });

  it('removeNotification removes by id', () => {
    useStore.getState().addNotification({ id: 'n1', type: 'success', title: 'Done' });
    useStore.getState().addNotification({ id: 'n2', type: 'error', title: 'Fail' });
    useStore.getState().removeNotification('n1');
    const notifs = useStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].id).toBe('n2');
  });

  // ─── Comparison slots ──────────────────────────────────────────────────────

  it('addComparisonSlot adds a slot up to max 5', () => {
    useStore.getState().addComparisonSlot();
    expect(useStore.getState().comparisonSlots).toHaveLength(4);
    useStore.getState().addComparisonSlot();
    useStore.getState().addComparisonSlot();
    useStore.getState().addComparisonSlot(); // should cap at 5
    expect(useStore.getState().comparisonSlots).toHaveLength(5);
  });

  it('removeComparisonSlot enforces min 2 slots', () => {
    useStore.setState({ comparisonSlots: [
      { key: '', data: null, loading: false, error: null },
      { key: '', data: null, loading: false, error: null },
    ]}, false);
    useStore.getState().removeComparisonSlot(0);
    expect(useStore.getState().comparisonSlots).toHaveLength(2);
  });
});
