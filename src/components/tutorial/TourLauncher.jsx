import React, { useState, useEffect } from 'react';
import { BookOpen, Play, RotateCcw, ChevronRight } from 'lucide-react';
import GuidedTour from './GuidedTour';
import tutorialSystem from '../../lib/tutorialSystem';

/**
 * TourLauncher — a panel listing all available tours with launch/reset controls.
 * Also auto-starts the welcome tour for first-time visitors.
 */
export default function TourLauncher() {
  const [activeTour, setActiveTour] = useState(null);
  const [open, setOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  // Auto-start welcome tour for first-time visitors
  useEffect(() => {
    if (tutorialSystem.isFirstVisit()) {
      const timer = setTimeout(() => setActiveTour('welcome'), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const tours = tutorialSystem.getTours();

  function handleReset(tourId, e) {
    e.stopPropagation();
    tutorialSystem.reset(tourId);
    forceUpdate(n => n + 1);
  }

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open tutorials"
        data-tour="tour-launcher"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 900,
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'var(--accent, #6366f1)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
          color: '#fff',
        }}
      >
        <BookOpen size={18} />
      </button>

      {/* Tour list panel */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 901 }} />
          <div
            style={{
              position: 'fixed', bottom: '80px', right: '24px', zIndex: 902,
              background: 'var(--bg-card, #1e293b)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '12px', padding: '16px', width: '280px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>
              Interactive Tours
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tours.map(tour => {
                const done = tutorialSystem.isCompleted(tour.id);
                return (
                  <div
                    key={tour.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px', borderRadius: '8px',
                      background: 'var(--bg-secondary, #0f172a)',
                      border: '1px solid var(--border, #334155)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {tour.title}
                        {done && <span style={{ fontSize: '10px', background: '#22c55e22', color: '#22c55e', padding: '1px 6px', borderRadius: '4px' }}>Done</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                        {tour.steps.length} steps
                      </div>
                    </div>

                    {done && (
                      <button
                        onClick={(e) => handleReset(tour.id, e)}
                        title="Replay tour"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', padding: '4px' }}
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}

                    <button
                      onClick={() => { setActiveTour(tour.id); setOpen(false); }}
                      style={{
                        background: 'var(--accent, #6366f1)', border: 'none',
                        borderRadius: '6px', padding: '5px 10px',
                        cursor: 'pointer', color: '#fff', fontSize: '12px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      <Play size={11} /> Start
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => { tutorialSystem.resetAll(); forceUpdate(n => n + 1); }}
              style={{
                marginTop: '12px', width: '100%', background: 'none',
                border: '1px solid var(--border, #334155)', borderRadius: '6px',
                padding: '7px', cursor: 'pointer', fontSize: '12px',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              Reset all tours
            </button>
          </div>
        </>
      )}

      {/* Active tour */}
      {activeTour && (
        <GuidedTour
          tourId={activeTour}
          onClose={() => setActiveTour(null)}
        />
      )}
    </>
  );
}
