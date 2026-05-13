import { ethers, JsonRpcProvider, Contract } from "ethers";
import {
  Invoice,
  EIP712_TYPES,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from "./types.js";
import { deserializeInvoice } from "./issuer.js";

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

export interface VerificationResult {
  signatureValid: boolean;
  hashMatches: boolean;
  paymentMatches: boolean;
  taxInvariantHolds: boolean;
  errors: string[];
}

export class InvoiceRecipient {
  constructor(
    private readonly registryAddress: string,
    private readonly chainId: bigint,
  ) {}

  /**
   * Full verification of a committed invoice. Implements the four checks from
   * Section 5 of the EIP: hash agreement, signature validity, payment match,
   * and the structural tax invariant.
   */
  async verify(
    provider: JsonRpcProvider,
    json: string,
    onChainInvoiceHash: string,
    paymentTxHash: string,
  ): Promise<VerificationResult> {
    const errors: string[] = [];
    let signatureValid = false;
    let hashMatches = false;
    let paymentMatches = false;
    let taxInvariantHolds = false;

    let invoice: Invoice;
    try {
      invoice = deserializeInvoice(json);
    } catch (e) {
      errors.push(`Invalid invoice JSON: ${(e as Error).message}`);
      return { signatureValid, hashMatches, paymentMatches, taxInvariantHolds, errors };
    }

    // ── Hash recomputation and on-chain agreement ──
    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: this.chainId,
      verifyingContract: this.registryAddress,
    };
    const recomputedHash = ethers.TypedDataEncoder.hash(domain, EIP712_TYPES, invoice);
    hashMatches = recomputedHash.toLowerCase() === onChainInvoiceHash.toLowerCase();
    if (!hashMatches) {
      errors.push(
        `Hash mismatch. Recomputed: ${recomputedHash}. On-chain: ${onChainInvoiceHash}`,
      );
    }

    // ── Signature recovery from the InvoiceCommitted event ──
    const registry = new Contract(
      this.registryAddress,
      [
        "event InvoiceCommitted(bytes32 indexed invoiceHash, address indexed issuer, address indexed recipient, bytes32 paymentTxRef, uint8 payloadMode, string uri, bytes encryptedPayload, bytes issuerSignature)",
      ],
      provider,
    );
    const filter = registry.filters.InvoiceCommitted(onChainInvoiceHash);
    const events = await registry.queryFilter(filter, 0, "latest");
    if (events.length === 0) {
      errors.push("No InvoiceCommitted event found for the given hash");
    } else {
      const ev = events[0] as ethers.EventLog;
      const signature = ev.args.issuerSignature;
      try {
        const recovered = ethers.verifyTypedData(
          domain,
          EIP712_TYPES,
          invoice,
          signature,
        );
        signatureValid = recovered.toLowerCase() === invoice.issuer.toLowerCase();
        if (!signatureValid) {
          errors.push(
            `Signature recovers to ${recovered}, expected ${invoice.issuer}`,
          );
        }
      } catch (e) {
        errors.push(`Signature recovery failed: ${(e as Error).message}`);
      }
    }

    // ── Payment-transaction match ──
    paymentMatches = await this.verifyPaymentTx(provider, paymentTxHash, invoice);
    if (!paymentMatches) {
      errors.push(
        `Payment transaction ${paymentTxHash} does not match invoice (token, amount, sender, or recipient mismatch)`,
      );
    }

    // ── Structural tax invariant ──
    taxInvariantHolds = this.verifyTaxInvariant(invoice);
    if (!taxInvariantHolds) {
      errors.push(
        "Tax invariant violated: sum(lineTotals) + sum(taxes) != fiatAmount",
      );
    }

    return { signatureValid, hashMatches, paymentMatches, taxInvariantHolds, errors };
  }

  /**
   * Walks the Transfer event logs of the payment tx looking for a match on
   * (token, from=issuer, to=recipient, value=paymentAmount).
   */
  private async verifyPaymentTx(
    provider: JsonRpcProvider,
    paymentTxHash: string,
    invoice: Invoice,
  ): Promise<boolean> {
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt) return false;

    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const erc20Iface = new ethers.Interface(ERC20_ABI);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== invoice.paymentToken.toLowerCase()) continue;
      if (log.topics[0] !== transferTopic) continue;

      try {
        const parsed = erc20Iface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;
        const from = parsed.args[0] as string;
        const to = parsed.args[1] as string;
        const value = parsed.args[2] as bigint;

        if (
          from.toLowerCase() === invoice.issuer.toLowerCase() &&
          to.toLowerCase() === invoice.recipient.toLowerCase() &&
          value === invoice.paymentAmount
        ) {
          return true;
        }
      } catch {
        // Not a parseable Transfer; skip.
      }
    }
    return false;
  }

  /**
   * Checks the EIP Section 1.4 invariant:
   * sum(lineItems[].lineTotal) + sum(taxes[].taxAmount) == fiatAmount.
   * Skipped (returns true) when both arrays are empty.
   */
  private verifyTaxInvariant(invoice: Invoice): boolean {
    if (invoice.lineItems.length === 0 && invoice.taxes.length === 0) {
      return true;
    }
    const lineSum = invoice.lineItems.reduce(
      (acc, l) => acc + l.lineTotalMilliUnits,
      0n,
    );
    const taxSum = invoice.taxes.reduce(
      (acc, t) => acc + t.taxAmountMilliUnits,
      0n,
    );
    return lineSum + taxSum === invoice.fiatAmountMilliUnits;
  }
}
