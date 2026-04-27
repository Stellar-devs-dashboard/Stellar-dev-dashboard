/**
 * SecurityHeaders (#106)
 *
 * Renders security-related <meta> tags in the document <head>.
 * Use this inside your root layout component alongside <Helmet> or directly
 * in index.html for Vite projects.
 *
 * Covered policies:
 *  - Content-Security-Policy (nonce optional for inline scripts)
 *  - X-Frame-Options equivalent (frame-ancestors in CSP)
 *  - Referrer-Policy
 *  - Permissions-Policy
 */

import { useEffect, useMemo } from 'react'
import { generateCspNonce, buildCspHeader } from '../utils/security'

/**
 * @param {{ nonce?: string }} props
 *   Pass a server-generated nonce for strict CSP inline-script control.
 *   If omitted, a client-side nonce is generated (less effective but still
 *   prevents most injected-script attacks).
 */
export function SecurityHeaders({ nonce }) {
  const resolvedNonce = useMemo(() => nonce ?? generateCspNonce(), [nonce])
  const cspValue = useMemo(() => buildCspHeader(resolvedNonce), [resolvedNonce])

  useEffect(() => {
    // Set meta http-equiv tags programmatically so they work in SPA contexts
    const metaTags = [
      { httpEquiv: 'Content-Security-Policy', content: cspValue },
      { httpEquiv: 'Referrer-Policy',         content: 'strict-origin-when-cross-origin' },
      { httpEquiv: 'X-Content-Type-Options',  content: 'nosniff' },
      { name: 'permissions-policy',           content: 'camera=(), microphone=(), geolocation=()' },
    ]

    const inserted = metaTags.map(({ httpEquiv, name, content }) => {
      const existing = httpEquiv
        ? document.querySelector(`meta[http-equiv="${httpEquiv}"]`)
        : document.querySelector(`meta[name="${name}"]`)

      if (existing) {
        existing.setAttribute('content', content)
        return null
      }

      const el = document.createElement('meta')
      if (httpEquiv) el.setAttribute('http-equiv', httpEquiv)
      if (name) el.setAttribute('name', name)
      el.setAttribute('content', content)
      document.head.appendChild(el)
      return el
    })

    return () => {
      // Clean up only the tags we inserted (not ones that already existed)
      inserted.forEach((el) => el && el.parentNode?.removeChild(el))
    }
  }, [cspValue])

  // Nothing to render — side-effect only
  return null
}

export default SecurityHeaders
