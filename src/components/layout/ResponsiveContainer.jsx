import React from 'react'
import { useResponsive } from '../../hooks/useResponsive'

export default function ResponsiveContainer({ 
  children, 
  className = '',
  mobileLayout = false,
  tabletLayout = false,
  style = {},
  ...props 
}) {
  const { isMobile, isTablet } = useResponsive()

  const getResponsiveStyles = () => {
    const baseStyles = {
      width: '100%',
      ...style,
    }

    if (isMobile && mobileLayout) {
      return {
        ...baseStyles,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }
    }

    if (isTablet && tabletLayout) {
      return {
        ...baseStyles,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
      }
    }

    return baseStyles
  }

  const getResponsiveClassName = () => {
    let classes = className
    
    if (isMobile) {
      classes += ' mobile-layout'
    }
    
    if (isTablet) {
      classes += ' tablet-layout'
    }
    
    return classes.trim()
  }

  return (
    <div 
      className={getResponsiveClassName()}
      style={getResponsiveStyles()}
      {...props}
    >
      {children}
    </div>
  )
}

// Responsive grid component
export function ResponsiveGrid({ 
  children, 
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = { mobile: '12px', tablet: '16px', desktop: '20px' },
  className = '',
  style = {},
  ...props 
}) {
  const { isMobile, isTablet } = useResponsive()

  const getGridStyles = () => {
    let gridColumns = columns.desktop
    let gridGap = gap.desktop

    if (isMobile) {
      gridColumns = columns.mobile
      gridGap = gap.mobile
    } else if (isTablet) {
      gridColumns = columns.tablet
      gridGap = gap.tablet
    }

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
      gap: gridGap,
      width: '100%',
      ...style,
    }
  }

  return (
    <div 
      className={`responsive-grid ${className}`}
      style={getGridStyles()}
      {...props}
    >
      {children}
    </div>
  )
}

// Responsive flex component
export function ResponsiveFlex({ 
  children, 
  direction = { mobile: 'column', tablet: 'row', desktop: 'row' },
  gap = { mobile: '12px', tablet: '16px', desktop: '20px' },
  align = 'stretch',
  justify = 'flex-start',
  className = '',
  style = {},
  ...props 
}) {
  const { isMobile, isTablet } = useResponsive()

  const getFlexStyles = () => {
    let flexDirection = direction.desktop
    let flexGap = gap.desktop

    if (isMobile) {
      flexDirection = direction.mobile
      flexGap = gap.mobile
    } else if (isTablet) {
      flexDirection = direction.tablet
      flexGap = gap.tablet
    }

    return {
      display: 'flex',
      flexDirection,
      gap: flexGap,
      alignItems: align,
      justifyContent: justify,
      width: '100%',
      ...style,
    }
  }

  return (
    <div 
      className={`responsive-flex ${className}`}
      style={getFlexStyles()}
      {...props}
    >
      {children}
    </div>
  )
}