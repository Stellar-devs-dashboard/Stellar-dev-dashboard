import * as StellarSdk from "@stellar/stellar-sdk";
import { getServer, NETWORKS, isValidPublicKey, type NetworkName } from "./stellar";
import { measureAsync, recordCustomMetric } from "./performanceMonitoring";

export const OPERATION_TYPES = [
  { value: "payment", label: "Payment" },
  { value: "createAccount", label: "Create Account" },
  { value: "changeTrust", label: "Change Trust" },
  { value: "manageSellOffer", label: "Manage Sell Offer" },
  { value: "manageBuyOffer", label: "Manage Buy Offer" },
  { value: "setOptions", label: "Set Options" },
  { value: "accountMerge", label: "Account Merge" },
  { value: "manageData", label: "Manage Data" },
  // Extended operation types (#111)
  { value: "pathPaymentStrictSend", label: "Path Payment (Strict Send)" },
  { value: "pathPaymentStrictReceive", label: "Path Payment (Strict Receive)" },
  { value: "claimClaimableBalance", label: "Claim Claimable Balance" },
  { value: "createClaimableBalance", label: "Create Claimable Balance" },
  { value: "bumpSequence", label: "Bump Sequence" },
  { value: "revokeSponsorship", label: "Revoke Sponsorship" },
  { value: "beginSponsoringFutureReserves", label: "Begin Sponsoring Future Reserves" },
  { value: "endSponsoringFutureReserves", label: "End Sponsoring Future Reserves" },
  // Fee-bump, sponsorship, and clawback operations (#196)
  { value: "feeBump", label: "Fee-Bump Transaction" },
  { value: "clawback", label: "Clawback" },
  // Contract invocation
  { value: "invokeHostFunction", label: "Invoke Host Function (Contract Call)" },
];

export type OperationParams = Record<string, unknown>;

/** Stellar SDK Operation2 wrappers omit `.type`; tests and UI expect the XDR switch. */
type OperationWithType = StellarSdk.Operation & { type: StellarSdk.xdr.OperationType };

function withOperationType(op: unknown): OperationWithType {
  const internal = op as StellarSdk.Operation & {
    _attributes: { body: { _switch: StellarSdk.xdr.OperationType } };
  };
  return Object.assign(internal, { type: internal._attributes.body._switch });
}

function paramStr(params: OperationParams, key: string): string {
  const value = params[key];
  return value == null ? "" : String(value);
}

function paramOptionalStr(params: OperationParams, key: string): string | undefined {
  const value = params[key];
  if (value == null || value === "") return undefined;
  return String(value);
}

function paramAuthFlag(params: OperationParams, key: string): number | undefined {
  const value = params[key];
  if (value == null || value === "") return undefined;
  return parseInt(String(value), 10);
}

interface PathAssetInput {
  assetCode: string;
  assetIssuer: string;
}

interface ClaimantInput {
  destination: string;
  predicate: StellarSdk.xdr.ClaimPredicate;
}

interface InvokeArgInput {
  type: string;
  value: string;
}

function paramArray<T>(params: OperationParams, key: string): T[] {
  const value = params[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function opString(value: unknown): string {
  return String(value ?? "");
}

function opNumber(value: unknown): number {
  return Number(value);
}

function opAsset(value: unknown, codeKey: string, issuerKey: string, typeKey: string) {
  const assetType = opString((value as OperationParams)[typeKey]);
  if (assetType === "native") return StellarSdk.Asset.native();
  return new StellarSdk.Asset(
    opString((value as OperationParams)[codeKey]),
    opString((value as OperationParams)[issuerKey]),
  );
}

function opAssetList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const asset = entry as OperationParams;
    return new StellarSdk.Asset(opString(asset.assetCode), opString(asset.assetIssuer));
  });
}

export interface BuildOperationInput {
  type: string;
  params: OperationParams;
}

export interface BuildTransactionParams {
  sourceAccount: string;
  operations: BuildOperationInput[];
  memo?: string;
  memoType?: "text" | "id" | "hash" | "return";
  baseFee?: number;
  timeout?: number;
  network?: NetworkName;
}

export function createOperation(type: string, params: OperationParams) {
  switch (type) {
    case "payment":
      return StellarSdk.Operation.payment({
        destination: opString(params.destination),
        asset:
          opString(params.assetType) === "native"
            ? StellarSdk.Asset.native()
            : new StellarSdk.Asset(opString(params.assetCode), opString(params.assetIssuer)),
        amount: opString(params.amount),
      });

    case "createAccount":
      return StellarSdk.Operation.createAccount({
        destination: opString(params.destination),
        startingBalance: opString(params.startingBalance),
      });

    case "changeTrust":
      return StellarSdk.Operation.changeTrust({
        asset: new StellarSdk.Asset(opString(params.assetCode), opString(params.assetIssuer)),
        limit: params.limit ? opString(params.limit) : undefined,
      });

    case "manageSellOffer":
      return StellarSdk.Operation.manageSellOffer({
        selling: opAsset(params, "sellingAssetCode", "sellingAssetIssuer", "sellingAssetType"),
        buying: opAsset(params, "buyingAssetCode", "buyingAssetIssuer", "buyingAssetType"),
        amount: opString(params.amount),
        price: opString(params.price),
      });

    case "manageBuyOffer":
      return StellarSdk.Operation.manageBuyOffer({
        selling: opAsset(params, "sellingAssetCode", "sellingAssetIssuer", "sellingAssetType"),
        buying: opAsset(params, "buyingAssetCode", "buyingAssetIssuer", "buyingAssetType"),
        buyAmount: opString(params.buyAmount),
        price: opString(params.price),
      });

    case "setOptions": {
      const options: StellarSdk.OperationOptions.SetOptions = {};
      if (params.homeDomain) options.homeDomain = opString(params.homeDomain);
      if (params.setFlags) options.setFlags = opNumber(params.setFlags) as StellarSdk.AuthFlag;
      if (params.clearFlags) options.clearFlags = opNumber(params.clearFlags) as StellarSdk.AuthFlag;
      return StellarSdk.Operation.setOptions(options);
    }

    case "accountMerge":
      return StellarSdk.Operation.accountMerge({
        destination: opString(params.destination),
      });

    case "manageData":
      return StellarSdk.Operation.manageData({
        name: opString(params.name),
        value: params.value != null ? opString(params.value) : null,
      });

    // ── Extended operations (#111) ──────────────────────────────────────────

    case "pathPaymentStrictSend":
      return StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: opAsset(params, "sendAssetCode", "sendAssetIssuer", "sendAssetType"),
        sendAmount: opString(params.sendAmount),
        destination: opString(params.destination),
        destAsset: opAsset(params, "destAssetCode", "destAssetIssuer", "destAssetType"),
        destMin: opString(params.destMin),
        path: opAssetList(params.path),
      });

    case "pathPaymentStrictReceive":
      return StellarSdk.Operation.pathPaymentStrictReceive({
        sendAsset: opAsset(params, "sendAssetCode", "sendAssetIssuer", "sendAssetType"),
        sendMax: opString(params.sendMax),
        destination: opString(params.destination),
        destAsset: opAsset(params, "destAssetCode", "destAssetIssuer", "destAssetType"),
        destAmount: opString(params.destAmount),
        path: opAssetList(params.path),
      });

    case "claimClaimableBalance":
      return StellarSdk.Operation.claimClaimableBalance({
        balanceId: opString(params.balanceId),
      });

    case "createClaimableBalance": {
      const claimants = Array.isArray(params.claimants)
        ? params.claimants.map((entry) => {
            const claimant = entry as OperationParams;
            return new StellarSdk.Claimant(
              opString(claimant.destination),
              claimant.predicate as StellarSdk.xdr.ClaimPredicate,
            );
          })
        : [];
      return StellarSdk.Operation.createClaimableBalance({
        asset: opAsset(params, "assetCode", "assetIssuer", "assetType"),
        amount: opString(params.amount),
        claimants,
      });
    }

    case "bumpSequence":
      return StellarSdk.Operation.bumpSequence({
        bumpTo: opString(params.bumpTo),
      });

    case "revokeSponsorship":
      return StellarSdk.Operation.revokeAccountSponsorship({
        account: opString(params.account),
      });

    case "beginSponsoringFutureReserves": {
      return withOperationType(
        StellarSdk.Operation.beginSponsoringFutureReserves({
          sponsoredId: opString(params.sponsoredId),
        }),
      );
    }

    case "endSponsoringFutureReserves": {
      return withOperationType(StellarSdk.Operation.endSponsoringFutureReserves({}));
    }

    case "clawback": {
      if (parseFloat(opString(params.amount)) <= 0) {
        throw new Error('Clawback amount must be positive');
      }
      return withOperationType(
        StellarSdk.Operation.clawback({
          asset: new StellarSdk.Asset(opString(params.assetCode), opString(params.assetIssuer)),
          from: opString(params.from),
          amount: opString(params.amount),
        }),
      );
    }

    case "invokeHostFunction": {
      const contract = new StellarSdk.Contract(opString(params.contractId));
      const args = Array.isArray(params.args)
        ? params.args.map((entry) => {
            const arg = entry as OperationParams;
            switch (opString(arg.type)) {
              case "string":
                return StellarSdk.nativeToScVal(opString(arg.value), { type: "string" });
              case "int":
                return StellarSdk.nativeToScVal(BigInt(opString(arg.value)), { type: "i128" });
              case "address":
                return StellarSdk.Address.fromString(opString(arg.value)).toScVal();
              case "bool":
                return StellarSdk.nativeToScVal(opString(arg.value) === "true", { type: "bool" });
              default:
                throw new Error(`Unsupported argument type: ${opString(arg.type)}`);
            }
          })
        : [];
      return contract.call(opString(params.functionName), ...args);
    }

    default:
      throw new Error(`Unsupported operation type: ${type}`);
  }
}

export async function buildTransaction({
  sourceAccount,
  operations,
  memo,
  memoType = "text",
  baseFee = 100,
  timeout = 180,
  network = "testnet",
}: BuildTransactionParams) {
  if (!operations || operations.length === 0) {
    throw new Error("At least one operation is required");
  }

  const feeBumpOnly = operations.length === 1 && operations[0].type === "feeBump";
  const containsFeeBump = operations.some((op) => op.type === "feeBump");

  if (feeBumpOnly) {
    const op = operations[0];
    return feeBump({
      feeSource: opString(op.params.feeSource),
      baseFee: op.params.baseFee as string | number,
      innerTransaction: opString(op.params.innerTransaction),
      network,
    });
  }

  if (containsFeeBump) {
    throw new Error("feeBump can only be used as a standalone transaction.");
  }

  if (!isValidPublicKey(sourceAccount)) {
    throw new Error("Invalid source account");
  }

  const server = getServer(network);
  const account = await server.loadAccount(sourceAccount);

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORKS[network].passphrase,
  }).setTimeout(timeout);

  // Add operations
  operations.forEach((op) => {
    const operation = createOperation(op.type, op.params);
    txBuilder.addOperation(
      operation as Parameters<StellarSdk.TransactionBuilder['addOperation']>[0],
    );
  });

  // Add memo
  if (memo) {
    switch (memoType) {
      case "text":
        txBuilder.addMemo(StellarSdk.Memo.text(memo));
        break;
      case "id":
        txBuilder.addMemo(StellarSdk.Memo.id(memo));
        break;
      case "hash":
        txBuilder.addMemo(StellarSdk.Memo.hash(memo));
        break;
      case "return":
        txBuilder.addMemo(StellarSdk.Memo.return(memo));
        break;
    }
  }

  return txBuilder.build();
}

export async function simulateTransaction(params: BuildTransactionParams) {
  try {
    const transaction = await buildTransaction(params);
    const errors = [];
    const feeBumpOnly = params.operations.length === 1 && params.operations[0].type === "feeBump";

    if (!feeBumpOnly) {
      // Validate non-fee-bump transaction operations
      params.operations.forEach((op, index) => {
        if (op.type === "payment") {
          if (!isValidPublicKey(opString(op.params.destination))) {
            errors.push(`Operation ${index + 1}: Invalid destination`);
          }
          if (!op.params.amount || parseFloat(opString(op.params.amount)) <= 0) {
            errors.push(`Operation ${index + 1}: Invalid amount`);
          }
        } else if (op.type === "createAccount") {
          if (!isValidPublicKey(opString(op.params.destination))) {
            errors.push(`Operation ${index + 1}: Invalid destination`);
          }
          if (
            !op.params.startingBalance ||
            parseFloat(opString(op.params.startingBalance)) < 1
          ) {
            errors.push(
              `Operation ${index + 1}: Starting balance must be at least 1 XLM`,
            );
          }
        }
      });
    }

    const fee = parseInt(transaction.fee.toString(), 10);
    const operationCount = feeBumpOnly
      ? (transaction instanceof StellarSdk.FeeBumpTransaction
          ? transaction.innerTransaction.operations.length
          : transaction.operations.length) + 1
      : transaction.operations.length;

    return {
      success: errors.length === 0,
      errors,
      fee,
      operationCount,
      xdr: transaction.toXDR(),
      hash: transaction.hash().toString("hex"),
    };
  } catch (error) {
    return {
      success: false,
      errors: [error.message],
      fee: 0,
      operationCount: params.operations.length,
    };
  }
}

/**
 * Build a fee-bump transaction wrapping a signed inner transaction.
 *
 * @param {string} feeSource - The account paying the fee-bump fee (must be a valid public key)
 * @param {string} baseFee - The fee per operation in stroops (must be positive)
 * @param {string} innerTransaction - The signed inner transaction as XDR envelope string
 * @param {string} network - The network name (testnet, mainnet, futurenet, local)
 * @returns {FeeBumpTransaction} The fee-bump transaction envelope
 * @throws {Error} If feeSource is invalid, baseFee is not positive, or innerTransaction XDR is invalid
 */
export function feeBump({
  feeSource,
  baseFee,
  innerTransaction,
  network = "testnet",
}: {
  feeSource: string;
  baseFee: string | number;
  innerTransaction: string;
  network?: NetworkName;
}) {
  if (!isValidPublicKey(feeSource)) {
    throw new Error("Invalid fee source account (must be a valid public key)");
  }

  const fee = parseInt(String(baseFee), 10);
  if (!Number.isFinite(fee) || fee <= 0) {
    throw new Error("Base fee must be a positive integer");
  }

  if (!innerTransaction || typeof innerTransaction !== "string" || innerTransaction.trim() === "") {
    throw new Error("Inner transaction XDR is required and must be a non-empty string");
  }

  try {
    const innerTx = new StellarSdk.Transaction(innerTransaction, NETWORKS[network].passphrase)
    const wrappedTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      fee.toString(),
      innerTx,
      NETWORKS[network].passphrase,
    );
    return wrappedTx;
  } catch (error) {
    throw new Error(`Failed to build fee-bump transaction: ${error.message}`);
  }
}

export async function signAndSubmitTransaction(
  transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
  secretKey: string,
  network: NetworkName = "testnet",
) {
  if (!StellarSdk.StrKey.isValidEd25519SecretSeed(secretKey)) {
    throw new Error("Invalid secret key");
  }

  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  const signingStart = performance.now();
  transaction.sign(keypair);
  recordCustomMetric("TRANSACTION_SIGNING_DURATION", performance.now() - signingStart, {
    network,
    operationCount: transaction.operations?.length || 0,
    signer: "local-keypair",
  });

  const server = getServer(network);
  const response = await measureAsync(
    "TRANSACTION_SUBMIT_DURATION",
    () => server.submitTransaction(transaction),
    { network, operationCount: transaction.operations?.length || 0 },
  );

  return {
    hash: response.hash,
    ledger: response.ledger,
    successful: response.successful,
  };
}
