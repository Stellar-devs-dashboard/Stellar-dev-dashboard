/// <reference types="vite/client" />

declare module '*.css';

declare module '@simplewebauthn/browser' {
  export function startRegistration(options: Record<string, unknown>): Promise<unknown>;
  export function startAuthentication(options: Record<string, unknown>): Promise<unknown>;
}
