// Mirrors InvoiceCommitmentTypes.sol exactly. Field order MUST match the
// EIP-712 type string in InvoiceHasher.sol; otherwise computed digests will diverge.

export enum PayloadMode {
  OffChain = 0,
  EncryptedOnChain = 1,
}

export interface TaxIdentity {
  scheme: string;
  id: string;
}

export interface TaxEntry {
  taxType: string;
  taxScheme: string;
  rateBps: bigint;
  baseAmountMilliUnits: bigint;
  taxAmountMilliUnits: bigint;
}

export interface LineItem {
  description: string;
  quantityScaled: bigint;
  unit: string;
  unitPriceMilliUnits: bigint;
  lineTotalMilliUnits: bigint;
  taxRefIndex: bigint;
}

export interface Invoice {
  invoiceId: string;
  issueDate: bigint;
  dueDate: bigint;
  paymentTerms: string;
  purchaseOrderRef: string;

  issuer: string;
  issuerTaxId: TaxIdentity;
  recipient: string;
  recipientTaxId: TaxIdentity;

  paymentToken: string;
  paymentAmount: bigint;
  fiatCurrency: string;
  fiatAmountMilliUnits: bigint;
  fxRateScaled: bigint;
  fxOracle: string;
  fxTimestamp: bigint;

  taxes: TaxEntry[];
  lineItems: LineItem[];

  jurisdiction: string;
  regulatoryData: string;  // hex string, "0x" if empty

  nonce: bigint;
}

// EIP-712 typed data definitions. Order of fields here MUST match the
// INVOICE_TYPEHASH string in InvoiceHasher.sol byte-for-byte.
export const EIP712_TYPES = {
  TaxIdentity: [
    { name: "scheme", type: "string" },
    { name: "id",     type: "string" },
  ],
  TaxEntry: [
    { name: "taxType",              type: "string"  },
    { name: "taxScheme",            type: "string"  },
    { name: "rateBps",              type: "uint256" },
    { name: "baseAmountMilliUnits", type: "uint256" },
    { name: "taxAmountMilliUnits",  type: "uint256" },
  ],
  LineItem: [
    { name: "description",         type: "string"  },
    { name: "quantityScaled",      type: "uint256" },
    { name: "unit",                type: "string"  },
    { name: "unitPriceMilliUnits", type: "uint256" },
    { name: "lineTotalMilliUnits", type: "uint256" },
    { name: "taxRefIndex",         type: "uint256" },
  ],
  Invoice: [
    { name: "invoiceId",            type: "string"  },
    { name: "issueDate",            type: "uint256" },
    { name: "dueDate",              type: "uint256" },
    { name: "paymentTerms",         type: "string"  },
    { name: "purchaseOrderRef",     type: "string"  },
    { name: "issuer",               type: "address" },
    { name: "issuerTaxId",          type: "TaxIdentity" },
    { name: "recipient",            type: "address" },
    { name: "recipientTaxId",       type: "TaxIdentity" },
    { name: "paymentToken",         type: "address" },
    { name: "paymentAmount",        type: "uint256" },
    { name: "fiatCurrency",         type: "string"  },
    { name: "fiatAmountMilliUnits", type: "uint256" },
    { name: "fxRateScaled",         type: "uint256" },
    { name: "fxOracle",             type: "address" },
    { name: "fxTimestamp",          type: "uint256" },
    { name: "taxes",                type: "TaxEntry[]" },
    { name: "lineItems",            type: "LineItem[]" },
    { name: "jurisdiction",         type: "string"  },
    { name: "regulatoryData",       type: "bytes"   },
    { name: "nonce",                type: "uint256" },
  ],
} as { [key: string]: { name: string; type: string }[] };

export const EIP712_DOMAIN_NAME = "VerifiableInvoiceCommitment";
export const EIP712_DOMAIN_VERSION = "1";
