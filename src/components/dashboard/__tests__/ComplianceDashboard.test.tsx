import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComplianceDashboard from '../ComplianceDashboard';

describe('ComplianceDashboard', () => {
  beforeEach(() => {
    // Mock window.print
    Object.defineProperty(window, 'print', {
      value: vi.fn(),
      writable: true,
    });
  });

  it('should render compliance dashboard', () => {
    render(<ComplianceDashboard />);
    expect(screen.getByText('Compliance Dashboard')).toBeInTheDocument();
  });

  it('should render compliance metrics', () => {
    render(<ComplianceDashboard />);
    expect(screen.getByText('Transaction Compliance')).toBeInTheDocument();
    expect(screen.getByText('KYC Verification')).toBeInTheDocument();
    expect(screen.getByText('AML Screening')).toBeInTheDocument();
  });

  it('should render compliance rules', () => {
    render(<ComplianceDashboard />);
    expect(screen.getByText('Transaction Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Sanctions Screening')).toBeInTheDocument();
  });

  it('should call window.print when print button is clicked', () => {
    render(<ComplianceDashboard />);
    const printButton = screen.getByText('Print Report');
    fireEvent.click(printButton);
    expect(window.print).toHaveBeenCalled();
  });

  it('should render print header and footer', () => {
    render(<ComplianceDashboard />);
    expect(screen.getByText('Monitor regulatory compliance status and rule adherence.')).toBeInTheDocument();
  });
});
