import React, { useState, useEffect } from 'react';
import { BookOpen, Play, RotateCcw, ChevronRight, Trophy, Clock, Zap, Award } from 'lucide-react';
import GuidedTour from './GuidedTour';
import tutorialSystem from '../../lib/tutorialSystem';

/**
 * TourLauncher — enhanced panel with categories, progress tracking, and achievements
 * Auto-starts the welcome tour for first-time visitors
 */
export default function TourLauncher() {
  const [activeTour, setActiveTour] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAchievements, setShowAchievements] = useState(false);
  const [, forceUpdate] = useState(0);

  // Auto-start welcome tour for first-time visitors
  useEffect(() => {
    if (tutorialSystem.isFirstVisit()) {
      const timer = setTimeout(() => setActiveTour('welcome'), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const tours = tutorialSystem.getTours();
  const categories = ['all', ...tutorialSystem.getCategories()];
  const overallProgress = tutorialSystem.getOverallProgress();
  const achievements = tutorialSystem.getAchievements();
  const recommended = tutorialSystem.getRecommendedTour();

  const filteredTours = selectedCategory === 'all' 
    ? tours 
    : tours.filter(t => t.category === selectedCategory);

  function handleReset(tourId, e) {
    e.stopPropagation();
    tutorialSystem.reset(tourId);
    forceUpdate(n => n + 1);
  }

  function handleStartTour(tourId) {
    setActiveTour(tourId);
    setOpen(false);
  }

  const difficultyColors = {
    beginner: '#22c55e',
    intermediate: '#f59e0b',
    advanced: '#ef4444',
  };

  return (
    <>
      {/* Floating help button with progress ring */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open tutorials"
        data-tour="tour-launcher"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 900,
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'var(--accent, #6366f1)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
          color: '#fff',
        }}
      >
        <svg 
          style={{ position: 'absolute', top: '-4px', left: '-4px', transform: 'rotate(-90deg)' }}
          width="64" 
          height="64"
        >
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="rgba(99,102,241,0.2)"
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="#22c55e"
            strokeWidth="3"
            fill="none"
            strokeDasharray={`${(overallProgress.percentage / 100) * 176} 176`}
            strokeLinecap="round"
          />
        </svg>
        <BookOpen size={20} />
      </button>

      {/* Tour panel */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 901 }} />
          <div
            style={{
              position: 'fixed', bottom: '90px', right: '24px', zIndex: 902,
              background: 'var(--bg-card, #1e293b)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '16px', padding: '20px', width: '360px',
              maxHeight: '600px', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>
                  Interactive Tutorials
                </h3>
                <button
                  onClick={() => setShowAchievements(!showAchievements)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted, #94a3b8)',
                    padding: '4px',
                  }}
                >
                  <Trophy size={18} />
                </button>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                    Overall Progress
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)' }}>
                    {overallProgress.completed}/{overallProgress.total} completed
                  </span>
                </div>
                <div style={{ 
                  height: '6px', 
                  background: 'var(--bg-secondary, #0f172a)', 
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      width: `${overallProgress.percentage}%`, 
                      background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                      transition: 'width 0.3s ease',
                    }} 
                  />
                </div>
              </div>

              {/* Achievements section */}
              {showAchievements && (
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border, #334155)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)', marginBottom: '8px' }}>
                    🏆 Achievements
                  </div>
                  {achievements.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                      Complete tutorials to earn achievements!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {achievements.map(ach => (
                        <div key={ach.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px',
                          background: 'var(--accent, #6366f1)15',
                          borderRadius: '6px',
                        }}>
                          <span style={{ fontSize: '18px' }}>{ach.icon}</span>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)' }}>
                              {ach.title}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                              {ach.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommended tour */}
              {recommended && (
                <div style={{
                  background: 'linear-gradient(135deg, var(--accent, #6366f1)20, var(--accent, #6366f1)10)',
                  border: '1px solid var(--accent, #6366f1)40',
                  borderRadius: '8px',
                  padding: '10px',
                  marginBottom: '12px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-bright, #818cf8)', marginBottom: '4px' }}>
                    ⭐ Recommended Next
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)' }}>
                        {recommended.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                        {recommended.estimatedTime} · {recommended.difficulty}
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartTour(recommended.id)}
                      style={{
                        background: 'var(--accent, #6366f1)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Play size={12} /> Start
                    </button>
                  </div>
                </div>
              )}

              {/* Category filter */}
              <div style={{ 
                display: 'flex', 
                gap: '6px', 
                flexWrap: 'wrap',
              }}>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      background: selectedCategory === cat ? 'var(--accent, #6366f1)' : 'var(--bg-secondary, #0f172a)',
                      border: selectedCategory === cat ? 'none' : '1px solid var(--border, #334155)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      color: selectedCategory === cat ? '#fff' : 'var(--text-secondary, #cbd5e1)',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Tour list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredTours.map(tour => {
                const done = tutorialSystem.isCompleted(tour.id);
                const progress = tutorialSystem.getProgress(tour.id);
                const isLocked = tour.prerequisites && tour.prerequisites.length > 0 && 
                  !tour.prerequisites.every(prereq => tutorialSystem.isCompleted(prereq));

                return (
                  <div
                    key={tour.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '10px',
                      background: 'var(--bg-secondary, #0f172a)',
                      border: '1px solid var(--border, #334155)',
                      opacity: isLocked ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ fontSize: '24px', lineHeight: 1 }}>{tour.thumbnail}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          marginBottom: '4px',
                        }}>
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: 700, 
                            color: 'var(--text-primary, #f1f5f9)',
                          }}>
                            {tour.title}
                          </span>
                          {done && (
                            <span style={{ 
                              fontSize: '10px', 
                              background: '#22c55e22', 
                              color: '#22c55e', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}>
                              ✓ Done
                            </span>
                          )}
                          {isLocked && (
                            <span style={{ 
                              fontSize: '10px', 
                              background: '#94a3b822', 
                              color: '#94a3b8', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}>
                              🔒 Locked
                            </span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-muted, #94a3b8)',
                          marginBottom: '6px',
                        }}>
                          {tour.description}
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px',
                          fontSize: '11px',
                          color: 'var(--text-muted, #94a3b8)',
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} />
                            {tour.estimatedTime}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Zap size={11} />
                            {tour.steps.length} steps
                          </span>
                          <span 
                            style={{ 
                              fontSize: '10px',
                              fontWeight: 600,
                              color: difficultyColors[tour.difficulty],
                              textTransform: 'capitalize',
                            }}
                          >
                            {tour.difficulty}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar for incomplete tours */}
                    {!done && progress.percentage > 0 && (
                      <div>
                        <div style={{ 
                          height: '4px', 
                          background: 'var(--bg-card, #1e293b)', 
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              width: `${progress.percentage}%`, 
                              background: 'var(--accent, #6366f1)',
                              transition: 'width 0.3s ease',
                            }} 
                          />
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
                          {progress.percentage}% complete
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {done && (
                        <button
                          onClick={(e) => handleReset(tour.id, e)}
                          title="Replay tour"
                          style={{ 
                            background: 'var(--bg-card, #1e293b)',
                            border: '1px solid var(--border, #334155)',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            cursor: 'pointer', 
                            color: 'var(--text-muted, #94a3b8)',
                            fontSize: '11px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <RotateCcw size={11} /> Replay
                        </button>
                      )}

                      <button
                        onClick={() => handleStartTour(tour.id)}
                        disabled={isLocked}
                        style={{
                          background: isLocked ? 'var(--bg-card, #1e293b)' : 'var(--accent, #6366f1)', 
                          border: isLocked ? '1px solid var(--border, #334155)' : 'none',
                          borderRadius: '6px', 
                          padding: '5px 12px',
                          cursor: isLocked ? 'not-allowed' : 'pointer', 
                          color: isLocked ? 'var(--text-muted, #94a3b8)' : '#fff', 
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px',
                          flex: 1,
                          justifyContent: 'center',
                        }}
                      >
                        <Play size={11} /> {done ? 'Start Again' : 'Start Tutorial'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border, #334155)' }}>
              <button
                onClick={() => { tutorialSystem.resetAll(); forceUpdate(n => n + 1); }}
                style={{
                  width: '100%', 
                  background: 'none',
                  border: '1px solid var(--border, #334155)', 
                  borderRadius: '8px',
                  padding: '8px', 
                  cursor: 'pointer', 
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted, #94a3b8)',
                }}
              >
                Reset All Progress
              </button>
            </div>
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
