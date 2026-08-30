/**
 * useAssetOperations — Mutation hooks for asset issuance, clawback,
 * flag changes, and trustline authorization.
 *
 * Each mutation wraps its corresponding service function with
 * react-query's useMutation, providing loading/error/success states.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStore } from '../lib/store';
import { assetControlKeys } from '../lib/queryKeys';
import {
  buildSetFlagsTx,
  buildTrustlineAuthTx,
  buildIssuanceTx,
  buildClawbackTx,
  buildLockIssuerTx,
  submitSignedTx,
  signTransactionXdr,
} from '../lib/assetControl';
import { buildDryRunSummary, buildOperationEnvelope } from '../lib/assetControl';
import { NETWORKS, type NetworkName } from '../lib/stellar';
import type {
  FlagChangeRequest,
  TrustlineChangeRequest,
  IssuanceRequest,
  ClawbackRequest,
  OperationEnvelope,
} from '../types/assetControl';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MutationResult {
  xdr: string;
  envelope: OperationEnvelope;
}

export interface SubmitResult {
  hash: string;
  success: boolean;
  error?: string;
}

// ─── Set Flags Mutation ──────────────────────────────────────────────────────

export function useSetFlagsMutation() {
  const network = useStore((s) => s.network) as NetworkName;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issuerAddress,
      request,
    }: {
      issuerAddress: string;
      request: FlagChangeRequest;
    }): Promise<MutationResult> => {
      const xdr = await buildSetFlagsTx(issuerAddress, request, network);
      const passphrase = NETWORKS[network].passphrase;
      const envelope = buildOperationEnvelope(xdr, passphrase, [issuerAddress]);
      return { xdr, envelope };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: assetControlKeys.issuerState(variables.issuerAddress, network),
      });
    },
  });
}

// ─── Trustline Auth Mutation ─────────────────────────────────────────────────

export function useTrustlineAuthMutation() {
  const network = useStore((s) => s.network) as NetworkName;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issuerAddress,
      request,
    }: {
      issuerAddress: string;
      request: TrustlineChangeRequest;
    }): Promise<MutationResult> => {
      const xdr = await buildTrustlineAuthTx(issuerAddress, request, network);
      const passphrase = NETWORKS[network].passphrase;
      const envelope = buildOperationEnvelope(xdr, passphrase, [issuerAddress]);
      return { xdr, envelope };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: assetControlKeys.holders(
          variables.request.asset.code,
          variables.request.asset.issuer,
          network,
        ),
      });
    },
  });
}

// ─── Issuance Mutation ───────────────────────────────────────────────────────

export function useIssuanceMutation() {
  const network = useStore((s) => s.network) as NetworkName;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      request,
    }: {
      request: IssuanceRequest;
    }): Promise<MutationResult> => {
      const xdr = await buildIssuanceTx(request, network);
      const passphrase = NETWORKS[network].passphrase;
      const envelope = buildOperationEnvelope(xdr, passphrase, [request.asset.issuer]);
      return { xdr, envelope };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: assetControlKeys.issuerState(variables.request.asset.issuer, network),
      });
    },
  });
}

// ─── Clawback Mutation ───────────────────────────────────────────────────────

export function useClawbackMutation() {
  const network = useStore((s) => s.network) as NetworkName;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issuerAddress,
      request,
    }: {
      issuerAddress: string;
      request: ClawbackRequest;
    }): Promise<MutationResult> => {
      const xdr = await buildClawbackTx(issuerAddress, request, network);
      const passphrase = NETWORKS[network].passphrase;
      const envelope = buildOperationEnvelope(xdr, passphrase, [issuerAddress]);
      return { xdr, envelope };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: assetControlKeys.holders(
          variables.request.asset.code,
          variables.request.asset.issuer,
          network,
        ),
      });
    },
  });
}

// ─── Submit Signed Transaction ───────────────────────────────────────────────

export function useSubmitTransaction() {
  const network = useStore((s) => s.network) as NetworkName;

  return useMutation({
    mutationFn: async ({
      signedXdr,
    }: {
      signedXdr: string;
    }): Promise<SubmitResult> => {
      return submitSignedTx(signedXdr, network);
    },
  });
}
