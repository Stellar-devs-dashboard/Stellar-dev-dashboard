import { ArrowRight, BookOpen, Box, GitCommitHorizontal } from 'lucide-react';
import { COMPATIBILITY_MATRIX, INSTALLED_SDK_PROFILE } from '../../lib/compatibility';
import { panelStyle } from './styles';

export default function ChangeHistory() {
  return (
    <div className="compat-stack">
      <section style={panelStyle} aria-labelledby="matrix-heading">
        <div className="compat-section-heading">
          <div>
            <h2 id="matrix-heading">Versioned compatibility matrix</h2>
            <p>
              Matrix {COMPATIBILITY_MATRIX.matrixVersion}, reviewed{' '}
              {new Date(COMPATIBILITY_MATRIX.reviewedAt).toLocaleDateString()}.
            </p>
          </div>
          <BookOpen size={21} color="var(--cyan)" aria-hidden="true" />
        </div>
        <div className="compat-matrix-callout">
          <Box size={20} aria-hidden="true" />
          <div>
            <strong>Dashboard build: SDK {INSTALLED_SDK_PROFILE.version}</strong>
            <p>
              Compiled XDR range {INSTALLED_SDK_PROFILE.xdrRange.minimum}–
              {INSTALLED_SDK_PROFILE.xdrRange.maximum}. Matrix entries beyond that range describe
              upgrade requirements; they do not silently enable this build.
            </p>
          </div>
        </div>
      </section>

      <ol className="compat-history" aria-label="Protocol compatibility change history">
        {[...COMPATIBILITY_MATRIX.releases].reverse().map((release) => (
          <li key={release.protocol} style={panelStyle}>
            <div className="compat-history-marker" aria-hidden="true">
              <GitCommitHorizontal size={22} />
            </div>
            <article aria-labelledby={`protocol-${release.protocol}`}>
              <div className="compat-heading-line">
                <div>
                  <span className="compat-eyebrow">{release.lifecycle}</span>
                  <h2 id={`protocol-${release.protocol}`}>Protocol {release.protocol}</h2>
                </div>
                <span className="compat-sdk-version">SDK ≥ {release.sdk.version}</span>
              </div>
              <div className="compat-history-meta">
                <span>{release.xdr.label}</span>
                <ArrowRight size={13} aria-hidden="true" />
                <span>{release.dashboardFeatures.length} dashboard workflows mapped</span>
                <ArrowRight size={13} aria-hidden="true" />
                <span>{release.rpc.required.length} identity methods required</span>
              </div>
              <ul>
                {release.changed.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <details>
                <summary>RPC and feature mapping</summary>
                <div className="compat-history-details">
                  <div>
                    <strong>Required RPC</strong>
                    <p>{release.rpc.required.join(', ') || 'None'}</p>
                  </div>
                  <div>
                    <strong>Optional RPC</strong>
                    <p>{release.rpc.optional.join(', ') || 'None'}</p>
                  </div>
                  <div>
                    <strong>Features</strong>
                    <p>{release.dashboardFeatures.join(', ')}</p>
                  </div>
                </div>
              </details>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
