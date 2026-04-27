import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import {
  loadSessions,
  deleteSession,
  updateSession,
  submitMultisigTransaction,
  createSession,
  SESSION_STATUS,
  checkThresholdMet,
} from '../../lib/multisig';
import { useNotifications } from '../../hooks/useNotifications';
import SignatureCollector from './SignatureCollector';

const STATUS_COLOR = {
  pending: 'var(--text-muted)',
  collecting: 'var(--amber)',
  ready: 'var(--green)',
  submitted: 'var(--cyan)',
  failed: 'var(--red)',
};

const btnStyle = (variant = 'primary', disabled = false) => ({
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  border: `1px solid ${variant === 'primary' ? 'var(--cyan)' : variant === 'danger' ? 'var(--red)' : 'var(--border)'}`,
  background: variant === 'primary' ? 'var(--cyan-glow)' : variant === 'danger' ? 'var(--red-glow)' : 'transparent',
  color: variant === 'primary' ? 'var(--cyan)' : variant === 'danger' ? 'var(--red)' : 'var(--text-secondary)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'var(--transition)',
});

function SessionCard({ session, onSelect, onDelete, onSubmit, submitting }) {
  const { requiredSigners, collectedSignatures, threshold, status, description, createdAt } = session;
  const collectedKeys = collectedSignatures.map((s) => s.signerKey);
  const { currentWeight } = checkThresholdMet(collectedKeys, requiredSigners, threshold);
  const totalWeight = requiredSigners.reduce((s, r) => s + r.weight, 0);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${status === SESSION_STATUS.READY ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'var(--transition)',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
            {description}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {session.id} · {new Date(createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: STATUS_COLOR[status],
            boxShadow: `0 0 5px ${STATUS_COLOR[status]}`,
          }} />
          <span style={{ fontSize: '11px', color: STATUS_COLOR[status], fontFamily: 'var(--font-mono)' }}>
            {status}
          </span>
        </div>
      </div>

      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {collectedSignatures.length}/{requiredSigners.length} signed · weight {currentWeight}/{threshold}
          {totalWeight > 0 && ` (max ${totalWeight})`}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {status !== SESSION_STATUS.SUBMITTED && (
            <button style={btnStyle('primary')} onClick={() => onSelect(session)}>
              Open
            </button>
          )}
          {status === SESSION_STATUS.READY && (
            <button
              style={btnStyle('primary', submitting)}
              onClick={() => onSubmit(session)}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
          <button style={btnStyle('danger')} onClick={() => onDelete(session.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Manages all multisig sessions: list, open, submit, delete.
 * Also provides a form to create a new session from an XDR.
 */
export default function SessionManager() {
  const { network } = useStore();
  const { success, error: notifyError } = useNotifications();

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // New session form
  const [newXdr, setNewXdr] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newThreshold, setNewThreshold] = useState(2);
  const [newSigners, setNewSigners] = useState(''); // comma-separated "key:weight" pairs
  const [showNewForm, setShowNewForm] = useState(false);

  const refresh = useCallback(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = (id) => {
    deleteSession(id);
    if (selectedSession?.id === id) setSelectedSession(null);
    refresh();
  };

  const handleSubmit = async (session) => {
    setSubmitting(true);
    try {
      await submitMultisigTransaction(session.txXdr, network);
      updateSession(session.id, { status: SESSION_STATUS.SUBMITTED });
      success('Submitted', 'Transaction submitted to the network');
      refresh();
      if (selectedSession?.id === session.id) {
        setSelectedSession((s) => ({ ...s, status: SESSION_STATUS.SUBMITTED }));
      }
    } catch (err) {
      updateSession(session.id, { status: SESSION_STATUS.FAILED });
      notifyError('Submit Failed', err.message);
      refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSessionUpdate = (updated) => {
    setSelectedSession(updated);
    refresh();
  };

  const handleCreateSession = () => {
    if (!newXdr.trim()) return;

    const parsedSigners = newSigners
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [key, weight] = s.split(':');
        return { key: key?.trim(), weight: parseInt(weight, 10) || 1 };
      })
      .filter((s) => s.key);

    const session = createSession({
      txXdr: newXdr.trim(),
      sourceAddress: '',
      description: newDesc || 'Multisig Transaction',
      requiredSigners: parsedSigners,
      threshold: newThreshold,
      network,
    });

    success('Session Created', session.id);
    setNewXdr('');
    setNewDesc('');
    setNewSigners('');
    setShowNewForm(false);
    refresh();
    setSelectedSession(session);
  };

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-bright)',
    borderRadius: 'var(--radius-md)',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Session detail view */}
      {selectedSession ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              style={btnStyle('secondary')}
              onClick={() => setSelectedSession(null)}
            >
              ← Back
            </button>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px' }}>
              {selectedSession.description}
            </div>
          </div>
          <SignatureCollector
            session={selectedSession}
            onSessionUpdate={handleSessionUpdate}
          />
          {selectedSession.status === SESSION_STATUS.READY && (
            <button
              style={{ ...btnStyle('primary', submitting), padding: '12px 18px' }}
              onClick={() => handleSubmit(selectedSession)}
              disabled={submitting}
            >
              {submitting ? 'Submitting to Network…' : '✓ Submit Transaction'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Session list header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px' }}>
              Sessions ({sessions.length})
            </div>
            <button style={btnStyle('primary')} onClick={() => setShowNewForm((v) => !v)}>
              {showNewForm ? 'Cancel' : '+ New Session'}
            </button>
          </div>

          {/* New session form */}
          {showNewForm && (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>New Signature Session</div>
              </div>
              <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Description</span>
                  <input style={inputStyle} placeholder="e.g. Treasury payment" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Transaction XDR</span>
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={3}
                    placeholder="Base64 XDR of the unsigned transaction"
                    value={newXdr}
                    onChange={(e) => setNewXdr(e.target.value)}
                    aria-label="Transaction XDR"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Required Signers (key:weight, comma-separated)
                  </span>
                  <input
                    style={inputStyle}
                    placeholder="GABC...:2, GDEF...:1"
                    value={newSigners}
                    onChange={(e) => setNewSigners(e.target.value)}
                    aria-label="Required signers"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Threshold</span>
                  <input
                    type="number"
                    min={1}
                    style={{ ...inputStyle, width: '100px' }}
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(parseInt(e.target.value, 10) || 1)}
                    aria-label="Signature threshold"
                  />
                </label>
                <button style={btnStyle('primary', !newXdr.trim())} onClick={handleCreateSession} disabled={!newXdr.trim()}>
                  Create Session
                </button>
              </div>
            </div>
          )}

          {/* Session list */}
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '32px 0' }}>
              No sessions yet. Create one from the Setup tab or paste an XDR above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onSelect={setSelectedSession}
                  onDelete={handleDelete}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
