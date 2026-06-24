/**
 * SAR fixture generator: produces a real VIC commitment on Arbitrum Sepolia
 * as the canonical fixture for cross-layer composition with SAR receipts.
 *
 * Flow:
 *   1. Deploy a fresh MockERC20 (acting as USDC) on Arbitrum Sepolia.
 *   2. Generate a runtime recipient wallet (private key discarded).
 *   3. Mint mock USDC to the issuer.
 *   4. Construct a realistic invoice (Argentine company → Mexican recipient,
 *      1,210 USD, 21% IVA, consulting services).
 *   5. Sign with EIP-712.
 *   6. Transfer mock USDC from issuer to recipient.
 *   7. Commit invoice on-chain referencing the payment tx.
 *   8. Verify all four properties.
 *   9. Generate the _ext.invoice payload for nutstrut's SAR composition.
 *  10. Write fixture artifacts to fixtures/sar-composition/ at repo root.
 *
 * Output files:
 *   - invoice.json          The full signed invoice
 *   - commitment-data.json  invoiceHash, registrar, chain_id, payment_tx_ref,
 *                          tx hashes, block numbers, links to Arbiscan
 *   - ext-invoice.json      The _ext.invoice payload (drop-in for SAR receipts)
 *   - README.md             Documentation, verification commands, links
 *
 * Environment variables (from .env at repo root):
 *   ARBITRUM_SEPOLIA_RPC    RPC endpoint
 *   REGISTRY_ADDRESS        Canonical VIC registrar address
 *   PRIVATE_KEY             Issuer's private key (0x...)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ethers,
  Wallet,
  JsonRpcProvider,
  Contract,
  ContractFactory,
} from "ethers";
import { Invoice, PayloadMode } from "./types.js";
import { InvoiceIssuer, verifyHashAgreement } from "./issuer.js";
import { InvoiceRecipient } from "./recipient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration from environment ──
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!RPC_URL || !REGISTRY_ADDRESS || !PRIVATE_KEY) {
  console.error(
    "Missing environment variables. Required: ARBITRUM_SEPOLIA_RPC, REGISTRY_ADDRESS, PRIVATE_KEY",
  );
  console.error("Run from repo root after sourcing .env:");
  console.error("  source .env && cd examples/typescript && npm run sar-fixture");
  process.exit(1);
}

// ── Paths to compiled artifacts ──
const REGISTRY_ARTIFACT_PATH = resolve(
  __dirname,
  "../../../contracts/out/InvoiceCommitmentRegistry.sol/InvoiceCommitmentRegistry.json",
);
const MOCK_ERC20_ARTIFACT_PATH = resolve(
  __dirname,
  "../../../contracts/out/MockERC20.sol/MockERC20.json",
);

// ── Output directory for fixture artifacts ──
const FIXTURE_OUTPUT_DIR = resolve(__dirname, "../../../fixtures/sar-composition");

function loadArtifact(path: string): { abi: any[]; bytecode: string } {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
}

const MOCK_ERC20_ABI = [
  "constructor(string name, string symbol)",
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

async function main() {
  console.log("\n┌─────────────────────────────────────────────────────────┐");
  console.log("│  VIC + SAR Composition Fixture — Arbitrum Sepolia       │");
  console.log("└─────────────────────────────────────────────────────────┘\n");

  // ── Provider and issuer wallet ──
  const provider = new JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  console.log(`Network:          chain ${chainId} (Arbitrum Sepolia)`);
  console.log(`Registry:         ${REGISTRY_ADDRESS}`);

  const issuerWallet = new Wallet(PRIVATE_KEY!, provider);
  console.log(`Issuer wallet:    ${issuerWallet.address}`);

  const issuerBalance = await provider.getBalance(issuerWallet.address);
  console.log(`Issuer balance:   ${ethers.formatEther(issuerBalance)} ETH\n`);

  if (issuerBalance < ethers.parseEther("0.003")) {
    console.error("Insufficient ETH balance. Need at least 0.003 ETH for gas.");
    process.exit(1);
  }

  // ── Generate runtime recipient wallet ──
  const recipientWallet = Wallet.createRandom();
  console.log(`Recipient wallet (runtime, key discarded):`);
  console.log(`                  ${recipientWallet.address}\n`);

  // ── Step 1: Deploy MockERC20 ──
  console.log("[1] Deploying MockERC20 (acting as USDC)...");
  const erc20Artifact = loadArtifact(MOCK_ERC20_ARTIFACT_PATH);
  const usdcFactory = new ContractFactory(
    erc20Artifact.abi,
    erc20Artifact.bytecode,
    issuerWallet,
  );

  let issuerNonce = await issuerWallet.getNonce("pending");
  const usdc = await usdcFactory.deploy("Mock USDC (SAR Fixture)", "mUSDC", {
    nonce: issuerNonce++,
  });
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  const usdcDeployTx = usdc.deploymentTransaction()!;
  console.log(`    Address:      ${usdcAddress}`);
  console.log(`    Deploy tx:    ${usdcDeployTx.hash}`);

  // ── Step 2: Mint USDC to issuer ──
  console.log("\n[2] Minting 10,000 mUSDC to issuer...");
  const usdcContract = new Contract(usdcAddress, MOCK_ERC20_ABI, issuerWallet);
  const mintTx = await usdcContract.mint(
    issuerWallet.address,
    10_000_000_000n, // 10,000 USDC at 6 decimals
    { nonce: issuerNonce++ },
  );
  const mintReceipt = await mintTx.wait();
  console.log(`    Mint tx:      ${mintReceipt!.hash}`);

  // ── Step 3: Construct invoice ──
  console.log("\n[3] Constructing invoice...");
  const invoiceTimestamp = Math.floor(Date.parse("2026-06-20T15:00:00Z") / 1000);
  const dueTimestamp = Math.floor(Date.parse("2026-07-20T15:00:00Z") / 1000);

  const invoice: Invoice = {
    invoiceId: "FC-A-0001-SAR-FIXTURE-001",
    issueDate: BigInt(invoiceTimestamp),
    dueDate: BigInt(dueTimestamp),
    paymentTerms: "Net 30",
    purchaseOrderRef: "",

    issuer: issuerWallet.address,
    issuerTaxId: { scheme: "AR-CUIT", id: "30-12345678-9" },
    recipient: recipientWallet.address,
    recipientTaxId: { scheme: "MX-RFC", id: "CLIX850101AB1" },

    paymentToken: usdcAddress,
    paymentAmount: 1_210_000_000n, // 1,210 USDC at 6 decimals
    fiatCurrency: "USD",
    fiatAmountMilliUnits: 1_210_000n, // 1,210.000 USD
    fxRateScaled: 100_000_000n, // 1.00000000 (USDC ≈ USD)
    fxOracle: ethers.ZeroAddress,
    fxTimestamp: BigInt(invoiceTimestamp),

    taxes: [
      {
        taxType: "IVA",
        taxScheme: "AR-IVA-21",
        rateBps: 2100n,
        baseAmountMilliUnits: 1_000_000n,
        taxAmountMilliUnits: 210_000n,
      },
    ],
    lineItems: [
      {
        description: "Agentic commerce consulting (SAR/VIC composition fixture)",
        quantityScaled: 1000n,
        unit: "EA",
        unitPriceMilliUnits: 1_000_000n,
        lineTotalMilliUnits: 1_000_000n,
        taxRefIndex: 0n,
      },
    ],

    jurisdiction: "AR",
    regulatoryData: "0x",
    nonce: BigInt(Date.now()), // arbitrary nonce
  };
  console.log(`    Invoice ID:   ${invoice.invoiceId}`);
  console.log(`    Amount:       1,210.00 USD (1,210 mUSDC, IVA 21%)`);

  // ── Step 4: Sign with EIP-712 ──
  console.log("\n[4] Signing invoice with EIP-712...");
  const issuer = new InvoiceIssuer(issuerWallet, REGISTRY_ADDRESS!, chainId);
  const signed = await issuer.signInvoice(invoice);
  console.log(`    Invoice hash: ${signed.invoiceHash}`);
  console.log(`    Signature:    ${signed.signature.slice(0, 22)}...`);

  // ── Step 5: Verify hash agreement with on-chain ──
  console.log("\n[5] Verifying off-chain hash matches on-chain hash...");
  const agree = await verifyHashAgreement(
    provider,
    REGISTRY_ADDRESS!,
    invoice,
    signed.invoiceHash,
  );
  if (!agree) {
    throw new Error("Hash mismatch between TS and Solidity. Aborting.");
  }
  console.log(`    Hash agreement: YES ✓`);

  // ── Step 6: Transfer USDC from issuer to recipient ──
  console.log("\n[6] Transferring 1,210 mUSDC from issuer to recipient...");
  const paymentTx = await usdcContract.transfer(
    recipientWallet.address,
    invoice.paymentAmount,
    { nonce: issuerNonce++ },
  );
  const paymentReceipt = await paymentTx.wait();
  console.log(`    Payment tx:   ${paymentReceipt!.hash}`);
  console.log(`    Block:        ${paymentReceipt!.blockNumber}`);

  // ── Step 7: Commit invoice ──
  console.log("\n[7] Committing invoice on-chain...");
  const commitResult = await issuer.commit(
    provider,
    signed,
    paymentReceipt!.hash,
    PayloadMode.OffChain,
    "ipfs://bafy...sar-fixture",
    "0x",
    { nonce: issuerNonce++ },
  );
  console.log(`    Commit tx:    ${commitResult.txHash}`);

  // Fetch block number of commit tx
  const commitReceipt = await provider.getTransactionReceipt(commitResult.txHash);
  console.log(`    Block:        ${commitReceipt!.blockNumber}`);

  // ── Step 8: Full verification ──
  console.log("\n[8] Recipient-side verification (full 4-property check)...");
  const recipient = new InvoiceRecipient(REGISTRY_ADDRESS!, chainId);
  const result = await recipient.verify(
    provider,
    signed.json,
    commitResult.invoiceHash,
    paymentReceipt!.hash,
  );

  console.log(`    Signature valid:   ${result.signatureValid ? "YES ✓" : "NO ✗"}`);
  console.log(`    Hash matches:      ${result.hashMatches ? "YES ✓" : "NO ✗"}`);
  console.log(`    Payment matches:   ${result.paymentMatches ? "YES ✓" : "NO ✗"}`);
  console.log(`    Tax invariant ok:  ${result.taxInvariantHolds ? "YES ✓" : "NO ✗"}`);

  if (result.errors.length > 0) {
    console.log("\n    Errors:");
    for (const err of result.errors) console.log(`      • ${err}`);
  }

  const allPass =
    result.signatureValid &&
    result.hashMatches &&
    result.paymentMatches &&
    result.taxInvariantHolds;

  if (!allPass) {
    console.error("\n✗ Verification failed. Aborting fixture generation.");
    process.exit(1);
  }

  // ── Step 9: Generate fixture artifacts ──
  console.log("\n[9] Generating fixture artifacts...");

  mkdirSync(FIXTURE_OUTPUT_DIR, { recursive: true });

  // 9.1: invoice.json — full signed invoice
  const invoiceFixture = {
    description: "VIC Invoice signed by issuer with EIP-712, committed on Arbitrum Sepolia.",
    invoice: JSON.parse(signed.json),
    signature: signed.signature,
    invoiceHash: signed.invoiceHash,
  };
  writeFileSync(
    `${FIXTURE_OUTPUT_DIR}/invoice.json`,
    JSON.stringify(invoiceFixture, null, 2),
  );
  console.log(`    invoice.json         ✓`);

  // 9.2: commitment-data.json — all chain data for verification
  const commitmentData = {
    description:
      "On-chain commitment data for the VIC fixture. Use this to compose with SAR _ext.invoice.",
    network: {
      chain_id: Number(chainId),
      name: "Arbitrum Sepolia",
      rpc: RPC_URL,
    },
    registrar: REGISTRY_ADDRESS!,
    invoice_hash: signed.invoiceHash,
    payment_tx_ref: paymentReceipt!.hash,
    transactions: {
      mock_usdc_deploy: {
        tx_hash: usdcDeployTx.hash,
        address: usdcAddress,
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${usdcDeployTx.hash}`,
      },
      mint: {
        tx_hash: mintReceipt!.hash,
        amount: "10000000000",
        amount_human: "10,000 mUSDC",
      },
      payment: {
        tx_hash: paymentReceipt!.hash,
        block_number: paymentReceipt!.blockNumber,
        from: issuerWallet.address,
        to: recipientWallet.address,
        amount: invoice.paymentAmount.toString(),
        amount_human: "1,210 mUSDC",
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${paymentReceipt!.hash}`,
      },
      commitment: {
        tx_hash: commitResult.txHash,
        block_number: commitReceipt!.blockNumber,
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${commitResult.txHash}`,
      },
    },
    parties: {
      issuer: {
        address: issuerWallet.address,
        tax_id_scheme: "AR-CUIT",
        tax_id: "30-12345678-9",
      },
      recipient: {
        address: recipientWallet.address,
        tax_id_scheme: "MX-RFC",
        tax_id: "CLIX850101AB1",
        note: "Runtime-generated wallet, private key discarded after fixture creation.",
      },
    },
  };
  writeFileSync(
    `${FIXTURE_OUTPUT_DIR}/commitment-data.json`,
    JSON.stringify(commitmentData, null, 2),
  );
  console.log(`    commitment-data.json ✓`);

  // 9.3: ext-invoice.json — drop-in _ext.invoice payload for SAR receipts
  const extInvoice = {
    _ext: {
      invoice: {
        schema_id: "vic.invoice.v1",
        invoice_hash: signed.invoiceHash,
        chain_id: Number(chainId),
        registrar: REGISTRY_ADDRESS!,
        payment_tx_ref: paymentReceipt!.hash,
      },
    },
  };
  writeFileSync(
    `${FIXTURE_OUTPUT_DIR}/ext-invoice.json`,
    JSON.stringify(extInvoice, null, 2),
  );
  console.log(`    ext-invoice.json     ✓`);

  // 9.4: README.md
  const readme = generateReadme({
    chainId: Number(chainId),
    registrar: REGISTRY_ADDRESS!,
    invoiceHash: signed.invoiceHash,
    paymentTxRef: paymentReceipt!.hash,
    commitTxHash: commitResult.txHash,
    paymentBlock: paymentReceipt!.blockNumber,
    commitBlock: commitReceipt!.blockNumber,
    issuerAddress: issuerWallet.address,
    recipientAddress: recipientWallet.address,
    usdcAddress: usdcAddress,
  });
  writeFileSync(`${FIXTURE_OUTPUT_DIR}/README.md`, readme);
  console.log(`    README.md            ✓`);

  console.log(`\n  Fixture files written to: ${FIXTURE_OUTPUT_DIR}\n`);

  console.log("─────────────────────────────────────────────────────────────");
  console.log(" Composition payload for SAR _ext.invoice:");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(JSON.stringify(extInvoice, null, 2));
  console.log("─────────────────────────────────────────────────────────────\n");

  console.log("✓ Fixture generated successfully.\n");
}

function generateReadme(d: {
  chainId: number;
  registrar: string;
  invoiceHash: string;
  paymentTxRef: string;
  commitTxHash: string;
  paymentBlock: number;
  commitBlock: number;
  issuerAddress: string;
  recipientAddress: string;
  usdcAddress: string;
}): string {
  return `# VIC + SAR Composition Fixture

This directory contains a concrete on-chain VIC commitment on Arbitrum Sepolia,
designed to compose with [SAR (Settlement Attestation Receipt)](https://github.com/x402-foundation/x402/issues/1195)
via the \`_ext.invoice\` namespace.

The composition was discussed and agreed in [x402 issue #1195](https://github.com/x402-foundation/x402/issues/1195),
with the layer separation:

- **VIC** answers: *what was invoiced, with what tax breakdown, in what fiscal jurisdiction?*
- **operation-binding** answers: *what operation was the payment for?*
- **SAR** answers: *was the operation delivered correctly?*

## Files

- \`invoice.json\` — the full signed VIC Invoice (EIP-712 typed data + issuer signature).
- \`commitment-data.json\` — on-chain commitment data with all transaction hashes and Arbiscan links.
- \`ext-invoice.json\` — drop-in \`_ext.invoice\` payload for inclusion in SAR receipts.
- \`README.md\` — this file.

## Composition payload

The following payload can be inserted into a SAR receipt's \`_ext\` envelope to reference this VIC commitment:

\`\`\`json
{
  "_ext": {
    "invoice": {
      "schema_id": "vic.invoice.v1",
      "invoice_hash": "${d.invoiceHash}",
      "chain_id": ${d.chainId},
      "registrar": "${d.registrar}",
      "payment_tx_ref": "${d.paymentTxRef}"
    }
  }
}
\`\`\`

## Verification flow (6-step cross-layer audit)

The agreed verification flow from x402 issue #1195:

1. **Read SAR receipt** with \`defaultsettle verify <receipt.json>\`.
2. **Extract \`_ext.invoice\`** from the receipt.
3. **Fetch VIC commitment** from \`registrar\` on \`chain_id\` using \`invoice_hash\`. Read the \`InvoiceCommitted\` event log.
4. **Verify** the commitment's \`paymentTxRef\` matches \`_ext.invoice.payment_tx_ref\`.
5. **Verify SAR signature** independently against keys at \`https://defaultverifier.com/.well-known/sar-keys.json\`.
6. **Treat the pair** as a composed cross-layer audit fixture, not as either layer subsuming the other.

This 6-step flow is the audit trail a tax authority or compliance layer could replay independently.

## On-chain data

| Property | Value |
|----------|-------|
| Chain | Arbitrum Sepolia (chain_id: ${d.chainId}) |
| VIC Registrar | [\`${d.registrar}\`](https://sepolia.arbiscan.io/address/${d.registrar}) |
| Invoice Hash | \`${d.invoiceHash}\` |
| Payment Tx | [\`${d.paymentTxRef}\`](https://sepolia.arbiscan.io/tx/${d.paymentTxRef}) (block ${d.paymentBlock}) |
| Commit Tx | [\`${d.commitTxHash}\`](https://sepolia.arbiscan.io/tx/${d.commitTxHash}) (block ${d.commitBlock}) |
| Mock USDC | [\`${d.usdcAddress}\`](https://sepolia.arbiscan.io/address/${d.usdcAddress}) |
| Issuer | [\`${d.issuerAddress}\`](https://sepolia.arbiscan.io/address/${d.issuerAddress}) (CUIT 30-12345678-9, AR) |
| Recipient | [\`${d.recipientAddress}\`](https://sepolia.arbiscan.io/address/${d.recipientAddress}) (RFC CLIX850101AB1, MX) |

## Invoice details

- **Invoice ID:** FC-A-0001-SAR-FIXTURE-001
- **Amount:** 1,210 USD (1,210 mUSDC at 6 decimals)
- **Tax:** Argentine IVA 21% (2,100 bps over base 1,000 USD = 210 USD)
- **Line items:** 1 — "Agentic commerce consulting"
- **Jurisdiction:** AR

## Reproducing the SAR side

The composed SAR receipt with \`_ext.invoice\` referencing this commitment will be hosted in
[\`sar-sdk\` fixtures](https://github.com/xmandate-ai/sar-sdk) once produced by the SAR side.

A reference SAR receipt can be generated locally with:

\`\`\`bash
pipx install git+https://github.com/nutstrut/defaultsettle-cli.git
defaultsettle speedrun
\`\`\`

This produces a baseline SAR receipt (without \`_ext.invoice\`). The composition happens when
the SAR side embeds the \`ext-invoice.json\` payload from this directory into the receipt's
\`_ext\` envelope.

## References

- VIC EIP draft: [../../eip/eip-vic.md](../../eip/eip-vic.md)
- VIC paper (SSRN): [Mateos, J. (2026)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6795482)
- SAR proposal: [x402 issue #1195](https://github.com/x402-foundation/x402/issues/1195)
- VIC + SAR composition discussion: [x402 issue #1195 (composition thread)](https://github.com/x402-foundation/x402/issues/1195)
- VIC FacilitatorExtension hook PR: [x402 PR #2339](https://github.com/x402-foundation/x402/pull/2339)
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
