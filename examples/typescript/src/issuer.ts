import { ethers, Wallet, JsonRpcProvider, Contract } from "ethers";
import {
  Invoice,
  PayloadMode,
  EIP712_TYPES,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from "./types.js";

/// Minimal ABI fragment for the registrar functions used by the issuer.
const REGISTRY_ABI = [
  "function commitInvoice((string,uint256,uint256,string,string,address,(string,string),address,(string,string),address,uint256,string,uint256,uint256,address,uint256,(string,string,uint256,uint256,uint256)[],(string,uint256,string,uint256,uint256,uint256)[],string,bytes,uint256) invoice, bytes32 paymentTxRef, uint8 payloadMode, string uri, bytes encryptedPayload, bytes issuerSignature) external returns (bytes32)",
  "function hashInvoice((string,uint256,uint256,string,string,address,(string,string),address,(string,string),address,uint256,string,uint256,uint256,address,uint256,(string,string,uint256,uint256,uint256)[],(string,uint256,string,uint256,uint256,uint256)[],string,bytes,uint256) invoice) external view returns (bytes32)",
  "function isNonceUsed(address issuer, uint256 nonce) external view returns (bool)",
  "event InvoiceCommitted(bytes32 indexed invoiceHash, address indexed issuer, address indexed recipient, bytes32 paymentTxRef, uint8 payloadMode, string uri, bytes encryptedPayload, bytes issuerSignature)",
];

export interface SignedInvoice {
  invoice: Invoice;
  invoiceHash: string;
  signature: string;
  json: string;
}

export class InvoiceIssuer {
  constructor(
    private readonly wallet: Wallet,
    private readonly registryAddress: string,
    private readonly chainId: bigint,
  ) {}

  /**
   * Signs an invoice with EIP-712. The wallet's address must equal invoice.issuer.
   */
  async signInvoice(invoice: Invoice): Promise<SignedInvoice> {
    if (invoice.issuer.toLowerCase() !== this.wallet.address.toLowerCase()) {
      throw new Error(
        `Issuer mismatch: invoice.issuer=${invoice.issuer} wallet=${this.wallet.address}`,
      );
    }

    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: this.chainId,
      verifyingContract: this.registryAddress,
    };

    const signature = await this.wallet.signTypedData(domain, EIP712_TYPES, invoice);
    const invoiceHash = ethers.TypedDataEncoder.hash(domain, EIP712_TYPES, invoice);
    const json = serializeInvoice(invoice);

    return { invoice, invoiceHash, signature, json };
  }

  /**
   * Submits the commitment transaction. Can be called by the issuer themselves,
   * the recipient, or any third party — only the EIP-712 signature matters.
   */
  async commit(
    provider: JsonRpcProvider,
    signed: SignedInvoice,
    paymentTxRef: string,
    payloadMode: PayloadMode,
    uri: string,
    encryptedPayload: string,
    overrides: { nonce?: number } = {},
  ): Promise<{ txHash: string; invoiceHash: string }> {
    const registry = new Contract(
      this.registryAddress,
      REGISTRY_ABI,
      this.wallet.connect(provider),
    );

    const tx = await registry.commitInvoice(
      invoiceToTuple(signed.invoice),
      paymentTxRef,
      payloadMode,
      uri,
      encryptedPayload,
      signed.signature,
      overrides,
    );

    const receipt = await tx.wait();
    return { txHash: receipt!.hash, invoiceHash: signed.invoiceHash };
  }
}

/**
 * Cross-checks that the off-chain hash matches what the on-chain registry computes.
 * Catches typed-data drift between TS and Solidity early in development.
 */
export async function verifyHashAgreement(
  provider: JsonRpcProvider,
  registryAddress: string,
  invoice: Invoice,
  expectedHash: string,
): Promise<boolean> {
  const registry = new Contract(registryAddress, REGISTRY_ABI, provider);
  const onChainHash: string = await registry.hashInvoice(invoiceToTuple(invoice));
  return onChainHash.toLowerCase() === expectedHash.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts the Invoice object into the positional tuple ethers expects for the
 * contract call. Field order MUST match the Solidity struct declaration.
 */
export function invoiceToTuple(inv: Invoice): unknown[] {
  return [
    inv.invoiceId,
    inv.issueDate,
    inv.dueDate,
    inv.paymentTerms,
    inv.purchaseOrderRef,
    inv.issuer,
    [inv.issuerTaxId.scheme, inv.issuerTaxId.id],
    inv.recipient,
    [inv.recipientTaxId.scheme, inv.recipientTaxId.id],
    inv.paymentToken,
    inv.paymentAmount,
    inv.fiatCurrency,
    inv.fiatAmountMilliUnits,
    inv.fxRateScaled,
    inv.fxOracle,
    inv.fxTimestamp,
    inv.taxes.map((t) => [
      t.taxType,
      t.taxScheme,
      t.rateBps,
      t.baseAmountMilliUnits,
      t.taxAmountMilliUnits,
    ]),
    inv.lineItems.map((l) => [
      l.description,
      l.quantityScaled,
      l.unit,
      l.unitPriceMilliUnits,
      l.lineTotalMilliUnits,
      l.taxRefIndex,
    ]),
    inv.jurisdiction,
    inv.regulatoryData,
    inv.nonce,
  ];
}

/**
 * Serializes the invoice to a deterministic JSON string for off-chain transport.
 * BigInt values become decimal strings since JSON does not natively support BigInt.
 */
export function serializeInvoice(inv: Invoice): string {
  return JSON.stringify(
    inv,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

export function deserializeInvoice(json: string): Invoice {
  const obj = JSON.parse(json);
  return {
    ...obj,
    issueDate: BigInt(obj.issueDate),
    dueDate: BigInt(obj.dueDate),
    paymentAmount: BigInt(obj.paymentAmount),
    fiatAmountMilliUnits: BigInt(obj.fiatAmountMilliUnits),
    fxRateScaled: BigInt(obj.fxRateScaled),
    fxTimestamp: BigInt(obj.fxTimestamp),
    nonce: BigInt(obj.nonce),
    taxes: obj.taxes.map((t: any) => ({
      ...t,
      rateBps: BigInt(t.rateBps),
      baseAmountMilliUnits: BigInt(t.baseAmountMilliUnits),
      taxAmountMilliUnits: BigInt(t.taxAmountMilliUnits),
    })),
    lineItems: obj.lineItems.map((l: any) => ({
      ...l,
      quantityScaled: BigInt(l.quantityScaled),
      unitPriceMilliUnits: BigInt(l.unitPriceMilliUnits),
      lineTotalMilliUnits: BigInt(l.lineTotalMilliUnits),
      taxRefIndex: BigInt(l.taxRefIndex),
    })),
  };
}
