import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { addBreadcrumb } from '../../lib/errorReporting';

/**
 * Customizable dashboard grid with drag-and-drop and resizable widgets
 */
export default function DashboardGrid({ 
  widgets = [], 
  onLayoutChange, 
  onWidgetResize,
  onWidgetRemove,
  editable = false,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 16,
  minWidgetHeight = 200
}) {
  const [layout, setLayout] = useState(widgets);
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [resizingWidget, setResizingWidget] = useState(null);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 0, height: 0 });
  
  const gridRef = useRef(null);
  const { isMobile, isTablet } = useResponsive();
  const { handleError } = useErrorHandler('DashboardGrid');

  // Get responsive column count
  const getColumnCount = () => {
    if (isMobile) return columns.mobile;
    if (isTablet) return columns.tablet;
    return columns.desktop;
  };

  const columnCount = getColumnCount();

  // Handle layout changes
  const updateLayout = useCallback((newLayout) => {
    setLayout(newLayout);
    onLayoutChange?.(newLayout);
    addBreadcrumb('Dashboard layout updated', 'user_action', { 
      widgetCount: newLayout.length,
      editable 
    });
  }, [onLayoutChange, editable]);

  // Drag and drop handlers
  const handleDragStart = (e, widget, index) => {
    if (!editable) return;
    
    setDraggedWidget({ widget, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    
    // Add drag styling
    e.target.style.opacity = '0.5';
    
    addBreadcrumb('Widget drag started', 'user_action', { 
      widgetId: widget.id,
      widgetType: widget.type 
    });
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedWidget(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    if (!editable || !draggedWidget) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    if (!editable || !draggedWidget) return;
    
    e.preventDefault();
    
    const { index: dragIndex } = draggedWidget;
    if (dragIndex === dropIndex) return;

    const newLayout = [...layout];
    const [draggedItem] = newLayout.splice(dragIndex, 1);
    newLayout.splice(dropIndex, 0, draggedItem);
    
    updateLayout(newLayout);
    setDragOverIndex(null);
    
    addBreadcrumb('Widget dropped', 'user_action', { 
      from: dragIndex,
      to: dropIndex,
      widgetId: draggedItem.id
    });
  };

  // Resize handlers
  const handleResizeStart = (e, widget, index) => {
    if (!editable) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.target.closest('.widget-container').getBoundingClientRect();
    setResizingWidget({ widget, index });
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    setResizeStartSize({ width: rect.width, height: rect.height });
    
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    
    addBreadcrumb('Widget resize started', 'user_action', { 
      widgetId: widget.id 
    });
  };

  const handleResizeMove = useCallback((e) => {
    if (!resizingWidget) return;
    
    const deltaX = e.clientX - resizeStartPos.x;
    const deltaY = e.clientY - resizeStartPos.y;
    
    const newWidth = Math.max(200, resizeStartSize.width + deltaX);
    const newHeight = Math.max(minWidgetHeight, resizeStartSize.height + deltaY);
    
    const widgetElement = document.querySelector(`[data-widget-id="${resizingWidget.widget.id}"]`);
    if (widgetElement) {
      widgetElement.style.width = `${newWidth}px`;
      widgetElement.style.height = `${newHeight}px`;
    }
  }, [resizingWidget, resizeStartPos, resizeStartSize, minWidgetHeight]);

  const handleResizeEnd = useCallback(() => {
    if (!resizingWidget) return;
    
    const widgetElement = document.querySelector(`[data-widget-id="${resizingWidget.widget.id}"]`);
    if (widgetElement) {
      const rect = widgetElement.getBoundingClientRect();
      const updatedWidget = {
        ...resizingWidget.widget,
        width: rect.width,
        height: rect.height
      };
      
      const newLayout = [...layout];
      newLayout[resizingWidget.index] = updatedWidget;
      updateLayout(newLayout);
      
      onWidgetResize?.(updatedWidget, { width: rect.width, height: rect.height });
      
      addBreadcrumb('Widget resized', 'user_action', { 
        widgetId: updatedWidget.id,
        newSize: { width: rect.width, height: rect.height }
      });
    }
    
    setResizingWidget(null);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [resizingWidget, layout, updateLayout, onWidgetResize, handleResizeMove]);

  // Cleanup resize listeners
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  // Remove widget
  const handleRemoveWidget = (widget, index) => {
    if (!editable) return;
    
    const newLayout = layout.filter((_, i) => i !== index);
    updateLayout(newLayout);
    onWidgetRemove?.(widget);
    
    addBreadcrumb('Widget removed', 'user_action', { 
      widgetId: widget.id,
      widgetType: widget.type 
    });
  };

  const gridStyles = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    gap: `${gap}px`,
    width: '100%',
    minHeight: '200px',
    position: 'relative'
  };

  const getWidgetStyles = (widget, index) => {
    const baseStyles = {
      position: 'relative',
      minHeight: `${minWidgetHeight}px`,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'var(--transition)',
      cursor: editable ? 'move' : 'default',
      width: widget.width ? `${widget.width}px` : 'auto',
      height: widget.height ? `${widget.height}px` : 'auto',
      gridColumn: widget.span ? `span ${Math.min(widget.span, columnCount)}` : 'span 1'
    };

    // Drag over styling
    if (dragOverIndex === index && draggedWidget?.index !== index) {
      baseStyles.borderColor = 'var(--cyan)';
      baseStyles.boxShadow = '0 0 0 2px var(--cyan-glow)';
    }

    // Resizing styling
    if (resizingWidget?.index === index) {
      baseStyles.borderColor = 'var(--amber)';
      baseStyles.boxShadow = '0 0 0 2px var(--amber-glow)';
    }

    return baseStyles;
  };

  return (
    <div 
      ref={gridRef}
      style={gridStyles}
      className="dashboard-grid"
    >
      {layout.map((widget, index) => (
        <div
          key={widget.id}
          data-widget-id={widget.id}
          className="widget-container"
          style={getWidgetStyles(widget, index)}
          draggable={editable}
          onDragStart={(e) => handleDragStart(e, widget, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onMouseEnter={e => {
            if (editable) {
              e.currentTarget.style.borderColor = 'var(--cyan)';
            }
          }}
          onMouseLeave={e => {
            if (editable && dragOverIndex !== index && resizingWidget?.index !== index) {
              e.currentTarget.style.borderColor = 'var(--border)';
            }
          }}
        >
          {/* Widget Header */}
          {editable && (
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              display: 'flex',
              gap: '4px',
              zIndex: 10,
              opacity: 0,
              transition: 'opacity var(--transition)'
            }}
            className="widget-controls"
            >
              {/* Resize Handle */}
              <button
                onMouseDown={(e) => handleResizeStart(e, widget, index)}
                style={{
                  width: '20px',
                  height: '20px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'nw-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: 'var(--text-muted)'
                }}
                title="Resize widget"
              >
                ⤡
              </button>
              
              {/* Remove Button */}
              <button
                onClick={() => handleRemoveWidget(widget, index)}
                style={{
                  width: '20px',
                  height: '20px',
                  background: 'var(--red-glow)',
                  border: '1px solid var(--red)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: 'var(--red)'
                }}
                title="Remove widget"
              >
                ✕
              </button>
            </div>
          )}

          {/* Widget Content */}
          <div style={{
            width: '100%',
            height: '100%',
            pointerEvents: editable ? 'none' : 'auto'
          }}>
            {widget.component}
          </div>

          {/* Show controls on hover */}
          <style jsx>{`
            .widget-container:hover .widget-controls {
              opacity: 1;
            }
          `}</style>
        </div>
      ))}

      {/* Empty state */}
      {layout.length === 0 && (
        <div style={{
          gridColumn: `span ${columnCount}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          background: 'var(--bg-card)',
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-muted)',
          textAlign: 'center',
          padding: '40px 20px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            No Widgets Added
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.5, maxWidth: '300px' }}>
            {editable 
              ? 'Add widgets to customize your dashboard layout.'
              : 'Enable edit mode to add and arrange widgets.'
            }
          </div>
        </div>
      )}
    </div>
  );
}