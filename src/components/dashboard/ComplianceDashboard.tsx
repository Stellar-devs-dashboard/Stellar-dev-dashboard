import React, { useState, useEffect } from 'react';
import { Printer, Shield, AlertTriangle, CheckCircle, Clock, Download, FileText } from 'lucide-react';
import { useStore } from '../../lib/store';

interface ComplianceMetric {
  id: string;
  label: string;
  value: string | number;
  status: 'compliant' | 'warning' | 'non-compliant';
  details?: string;
}

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'pending';
  lastChecked: string;
}

export default function ComplianceDashboard() {
  const { network, connectedAddress } = useStore();
  const [metrics, setMetrics] = useState<ComplianceMetric[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mock data - in production, this would come from a compliance API
    const mockMetrics: ComplianceMetric[] = [
      {
        id: 'tx-compliance',
        label: 'Transaction Compliance',
        value: '98.5%',
        status: 'compliant',
        details: '98.5% of transactions comply with regulatory requirements',
      },
      {
        id: 'kyc-status',
        label: 'KYC Verification',
        value: 'Verified',
        status: 'compliant',
        details: 'Account has completed KYC verification',
      },
      {
        id: 'aml-check',
        label: 'AML Screening',
        value: 'Clear',
        status: 'compliant',
        details: 'No AML flags detected',
      },
      {
        id: 'geofencing',
        label: 'Geofencing Compliance',
        value: 'Pass',
        status: 'compliant',
        details: 'All transactions within allowed jurisdictions',
      },
      {
        id: 'reporting',
        label: 'Reporting Timeliness',
        value: '99.2%',
        status: 'warning',
        details: 'Some reports filed slightly outside SLA',
      },
    ];

    const mockRules: ComplianceRule[] = [
      {
        id: 'rule-1',
        name: 'Transaction Monitoring',
        description: 'All transactions must be monitored for suspicious activity',
        status: 'pass',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'rule-2',
        name: 'Sanctions Screening',
        description: 'All parties must be screened against sanctions lists',
        status: 'pass',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'rule-3',
        name: 'Large Transaction Reporting',
        description: 'Transactions above threshold must be reported',
        status: 'pass',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'rule-4',
        name: 'Record Retention',
        description: 'Records must be retained for required period',
        status: 'pending',
        lastChecked: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    setMetrics(mockMetrics);
    setRules(mockRules);
    setIsLoading(false);
  }, [network, connectedAddress]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = ['Metric', 'Value', 'Status', 'Details'];
    const metricRows = metrics.map(metric => [
      metric.label,
      metric.value,
      metric.status,
      metric.details || ''
    ]);

    const ruleHeaders = ['Rule Name', 'Description', 'Status', 'Last Checked'];
    const ruleRows = rules.map(rule => [
      rule.name,
      rule.description,
      rule.status,
      new Date(rule.lastChecked).toISOString()
    ]);

    const csvContent = [
      'COMPLIANCE METRICS',
      headers.join(','),
      ...metricRows.map(row => row.map(cell => `"${cell}"`).join(',')),
      '',
      'COMPLIANCE RULES',
      ruleHeaders.join(','),
      ...ruleRows.map(row => row.map(cell => `"${cell}"`).join(',')),
      '',
      `Generated on ${new Date().toISOString()}`,
      `Network: ${network}`,
      `Account: ${connectedAddress || 'Not connected'}`
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    // Generate print-friendly PDF by triggering print dialog
    // Users can save as PDF from the print dialog
    window.print();
  };

  const getStatusIcon = (status: ComplianceMetric['status']) => {
    switch (status) {
      case 'compliant':
        return <CheckCircle size={16} style={{ color: 'var(--green)' }} />;
      case 'warning':
        return <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />;
      case 'non-compliant':
        return <AlertTriangle size={16} style={{ color: 'var(--red)' }} />;
    }
  };

  const getRuleStatusIcon = (status: ComplianceRule['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle size={14} style={{ color: 'var(--green)' }} />;
      case 'fail':
        return <AlertTriangle size={14} style={{ color: 'var(--red)' }} />;
      case 'pending':
        return <Clock size={14} style={{ color: 'var(--amber)' }} />;
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading compliance data...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
            Compliance Dashboard
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Monitor regulatory compliance status and rule adherence.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleExportCsv}
            className="no-print"
            style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition)',
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPdf}
            className="no-print"
            style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition)',
            }}
          >
            <FileText size={14} />
            <span>Export PDF</span>
          </button>
          <button
            onClick={handlePrint}
            className="no-print"
            style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition)',
            }}
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <div className="print-only" style={{ fontSize: '10pt', color: '#666', marginBottom: '10px' }}>
        Generated on {new Date().toLocaleString()} | Network: {network} | Account: {connectedAddress || 'Not connected'}
      </div>

      {/* Compliance Metrics */}
      <section className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Shield size={18} style={{ color: 'var(--cyan)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', margin: 0 }}>
            Compliance Metrics
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {metrics.map((metric) => (
            <div
              key={metric.id}
              className="compliance-metric"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {metric.label}
                </span>
                {getStatusIcon(metric.status)}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {metric.value}
              </div>
              {metric.details && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {metric.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Compliance Rules */}
      <section className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Shield size={18} style={{ color: 'var(--cyan)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', margin: 0 }}>
            Compliance Rules
          </h2>
        </div>
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="audit-log-entry"
              style={{
                padding: '14px 18px',
                borderBottom: index < rules.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ marginTop: '2px' }}>{getRuleStatusIcon(rule.status)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {rule.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(rule.lastChecked).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {rule.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="print-footer">
        <div style={{ fontSize: '10pt', color: '#666' }}>
          This report was generated by the Stellar Dev Dashboard compliance monitoring system.
          For official compliance records, please contact your compliance officer.
        </div>
      </div>
    </div>
  );
}
