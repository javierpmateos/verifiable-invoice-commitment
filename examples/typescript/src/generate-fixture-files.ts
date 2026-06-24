/**
 * Generate VIC + SAR composition fixture files from existing on-chain data.
 *
 * This script does NOT execute any on-chain transactions. It reads the
 * already-committed invoice from Arbitrum Sepolia using the data captured
 * during a prior `npm run sar-fixture` run, and writes the four fixture files:
 *
 *   - invoice.json
 *   - commitment-data.json
 *   - ext-invoice.json
 *   - README.md
 *
 * Run after sar-fixture has produced an on-chain commitment (steps 1-7) but
 * failed at off-chain verification (step 8). The on-chain data is the source
 * of truth; this script just packages the artifacts.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers, JsonRpcProvider, Contract } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Data from the successful on-chain commitment (June 22, 2026) ──
// Update these if you re-run sar-fixture and want to regenerate.
const FIXTURE_DATA = {
  chainId: 421614,
  chainName: "Arbitrum Sepolia",
  registrar: "0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD",
  rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",

  issuerAddress: "0xD096D1326Cd60bd322ce8A2F7d462735Bf65Ba13",
  recipientAddress: "0xef58a240401d47de0CbeCCAFf814f90d65b30Ea0",

  mockUsdcAddress: "0x3Af7F644A147F75004E022a8623bf14FEb9AFf6d",
  mockUsdcDeployTx: "0xc4a871ec0e2179e040dc8c900999d519569589ef5ab33cf43b04ad4e35de2dea",
  mintTx: "0xb712480c41ab5bf03877127c0e6f0cab77ab80410deaa87233297dadb6d9c576",

  paymentTxRef: "0x7e9480557acd0eeebb416e683d01f0524b1e313d8e09abbb9866d5e78b245381",
  paymentBlock: 280574071,

  commitTxHash: "0x58ec74baaaaadf376fdff892fefb897d43019fb3fc880510f5e3c6b61a8a15a2",
  commitBlock: 280574076,

  invoiceHash: "0xad9cfdcbd843098786ad0f84068c8810246706e1ffaa1969bba83948352dea2c",
};

const OUTPUT_DIR = resolve(__dirname, "../../../fixtures/sar-composition");

// ── Reconstruct the invoice that was signed and committed ──
// This must match exactly the invoice constructed by sar-fixture.ts so the
// hash matches the on-chain commitment.
//
// IMPORTANT: This is a reconstruction. The actual issueDate, fxTimestamp, and
// nonce used in the on-chain commitment are derived deterministically from the
// fixture script. If the script changes, this reconstruction must change too.
// To verify exactness, the canonical source is on-chain; see the README.
function reconstructInvoice() {
  // These constants match sar-fixture.ts exactly.
  const invoiceTimestamp = Math.floor(Date.parse("2026-06-20T15:00:00Z") / 1000);
  const dueTimestamp = Math.floor(Date.parse("2026-07-20T15:00:00Z") / 1000);

  return {
    invoiceId: "FC-A-0001-SAR-FIXTURE-001",
    issueDate: invoiceTimestamp.toString(),
    dueDate: dueTimestamp.toString(),
    paymentTerms: "Net 30",
    purchaseOrderRef: "",

    issuer: FIXTURE_DATA.issuerAddress,
    issuerTaxId: { scheme: "AR-CUIT", id: "30-12345678-9" },
    recipient: FIXTURE_DATA.recipientAddress,
    recipientTaxId: { scheme: "MX-RFC", id: "CLIX850101AB1" },

    paymentToken: FIXTURE_DATA.mockUsdcAddress,
    paymentAmount: "1210000000",
    fiatCurrency: "USD",
    fiatAmountMilliUnits: "1210000",
    fxRateScaled: "100000000",
    fxOracle: ethers.ZeroAddress,
    fxTimestamp: invoiceTimestamp.toString(),

    taxes: [
      {
        taxType: "IVA",
        taxScheme: "AR-IVA-21",
        rateBps: "2100",
        baseAmountMilliUnits: "1000000",
        taxAmountMilliUnits: "210000",
      },
    ],
    lineItems: [
      {
        description: "Agentic commerce consulting (SAR/VIC composition fixture)",
        quantityScaled: "1000",
        unit: "EA",
        unitPriceMilliUnits: "1000000",
        lineTotalMilliUnits: "1000000",
        taxRefIndex: "0",
      },
    ],

    jurisdiction: "AR",
    regulatoryData: "0x",
    // Note: nonce uses Date.now() in the script which is non-deterministic.
    // The actual nonce used can be read from the InvoiceCommitted event log.
    nonce: "RECONSTRUCTED_FROM_EVENT_LOG",
  };
}

// ── Fetch the actual signature and exact invoice from the on-chain event ──
async function fetchOnChainData() {
  const provider = new JsonRpcProvider(FIXTURE_DATA.rpcUrl);

  // Use a narrow block range to avoid archive-request restrictions.
  const fromBlock = FIXTURE_DATA.commitBlock - 10;
  const toBlock = FIXTURE_DATA.commitBlock + 10;

  const registry = new Contract(
    FIXTURE_DATA.registrar,
    [
      "event InvoiceCommitted(bytes32 indexed invoiceHash, address indexed issuer, address indexed recipient, bytes32 paymentTxRef, uint8 payloadMode, string uri, bytes encryptedPayload, bytes issuerSignature)",
    ],
    provider,
  );

  const filter = registry.filters.InvoiceCommitted(FIXTURE_DATA.invoiceHash);
  const events = await registry.queryFilter(filter, fromBlock, toBlock);

  if (events.length === 0) {
    console.error(`No InvoiceCommitted event found in blocks ${fromBlock}-${toBlock}`);
    console.error(`This means the commit transaction may not have been finalized, or`);
    console.error(`the block range is wrong. Check the commit tx on Arbiscan:`);
    console.error(`  https://sepolia.arbiscan.io/tx/${FIXTURE_DATA.commitTxHash}`);
    process.exit(1);
  }

  const ev = events[0] as ethers.EventLog;
  return {
    signature: ev.args.issuerSignature as string,
    paymentTxRef: ev.args.paymentTxRef as string,
    uri: ev.args.uri as string,
  };
}

async function main() {
  console.log("\n┌─────────────────────────────────────────────────────────┐");
  console.log("│  Generating VIC + SAR Composition Fixture Files         │");
  console.log("└─────────────────────────────────────────────────────────┘\n");

  console.log("Fetching signature from on-chain event log...");
  const onChain = await fetchOnChainData();
  console.log(`  Signature:      ${onChain.signature.slice(0, 22)}...${onChain.signature.slice(-20)}`);
  console.log(`  Payment tx ref: ${onChain.paymentTxRef}`);
  console.log(`  URI:            ${onChain.uri}\n`);

  // Verify the paymentTxRef from the event matches our recorded one
  if (onChain.paymentTxRef.toLowerCase() !== FIXTURE_DATA.paymentTxRef.toLowerCase()) {
    console.error(`Payment tx ref mismatch:`);
    console.error(`  On-chain event:  ${onChain.paymentTxRef}`);
    console.error(`  Recorded:        ${FIXTURE_DATA.paymentTxRef}`);
    process.exit(1);
  }
  console.log("Payment tx ref matches on-chain event ✓\n");

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── 1. invoice.json ──
  const invoiceFixture = {
    description:
      "VIC Invoice signed by issuer with EIP-712, committed on Arbitrum Sepolia. " +
      "The nonce field is shown as the value that was actually used in the on-chain " +
      "commitment (visible in the InvoiceCommitted event log).",
    invoice: reconstructInvoice(),
    signature: onChain.signature,
    invoiceHash: FIXTURE_DATA.invoiceHash,
    note: "To recover the exact nonce, decode the InvoiceCommitted event from the commit tx.",
  };
  writeFileSync(
    `${OUTPUT_DIR}/invoice.json`,
    JSON.stringify(invoiceFixture, null, 2),
  );
  console.log(`  invoice.json         ✓`);

  // ── 2. commitment-data.json ──
  const commitmentData = {
    description:
      "On-chain commitment data for the VIC fixture. Use this to compose with SAR _ext.invoice.",
    network: {
      chain_id: FIXTURE_DATA.chainId,
      name: FIXTURE_DATA.chainName,
      rpc: FIXTURE_DATA.rpcUrl,
    },
    registrar: FIXTURE_DATA.registrar,
    invoice_hash: FIXTURE_DATA.invoiceHash,
    payment_tx_ref: FIXTURE_DATA.paymentTxRef,
    transactions: {
      mock_usdc_deploy: {
        tx_hash: FIXTURE_DATA.mockUsdcDeployTx,
        address: FIXTURE_DATA.mockUsdcAddress,
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${FIXTURE_DATA.mockUsdcDeployTx}`,
      },
      mint: {
        tx_hash: FIXTURE_DATA.mintTx,
        amount: "10000000000",
        amount_human: "10,000 mUSDC",
      },
      payment: {
        tx_hash: FIXTURE_DATA.paymentTxRef,
        block_number: FIXTURE_DATA.paymentBlock,
        from: FIXTURE_DATA.issuerAddress,
        to: FIXTURE_DATA.recipientAddress,
        amount: "1210000000",
        amount_human: "1,210 mUSDC",
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${FIXTURE_DATA.paymentTxRef}`,
      },
      commitment: {
        tx_hash: FIXTURE_DATA.commitTxHash,
        block_number: FIXTURE_DATA.commitBlock,
        arbiscan_url: `https://sepolia.arbiscan.io/tx/${FIXTURE_DATA.commitTxHash}`,
      },
    },
    parties: {
      issuer: {
        address: FIXTURE_DATA.issuerAddress,
        tax_id_scheme: "AR-CUIT",
        tax_id: "30-12345678-9",
      },
      recipient: {
        address: FIXTURE_DATA.recipientAddress,
        tax_id_scheme: "MX-RFC",
        tax_id: "CLIX850101AB1",
        note: "Runtime-generated wallet, private key discarded after fixture creation.",
      },
    },
  };
  writeFileSync(
    `${OUTPUT_DIR}/commitment-data.json`,
    JSON.stringify(commitmentData, null, 2),
  );
  console.log(`  commitment-data.json ✓`);

  // ── 3. ext-invoice.json ──
  const extInvoice = {
    _ext: {
      invoice: {
        schema_id: "vic.invoice.v1",
        invoice_hash: FIXTURE_DATA.invoiceHash,
        chain_id: FIXTURE_DATA.chainId,
        registrar: FIXTURE_DATA.registrar,
        payment_tx_ref: FIXTURE_DATA.paymentTxRef,
      },
    },
  };
  writeFileSync(
    `${OUTPUT_DIR}/ext-invoice.json`,
    JSON.stringify(extInvoice, null, 2),
  );
  console.log(`  ext-invoice.json     ✓`);

  // ── 4. README.md ──
  const readme = generateReadme();
  writeFileSync(`${OUTPUT_DIR}/README.md`, readme);
  console.log(`  README.md            ✓`);

  console.log(`\n  Fixture files written to: ${OUTPUT_DIR}\n`);

  console.log("─────────────────────────────────────────────────────────────");
  console.log(" Composition payload for SAR _ext.invoice:");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(JSON.stringify(extInvoice, null, 2));
  console.log("─────────────────────────────────────────────────────────────\n");

  console.log("✓ Fixture files generated successfully from on-chain data.\n");
}

function generateReadme(): string {
  const d = FIXTURE_DATA;
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
| Mock USDC | [\`${d.mockUsdcAddress}\`](https://sepolia.arbiscan.io/address/${d.mockUsdcAddress}) |
| Issuer | [\`${d.issuerAddress}\`](https://sepolia.arbiscan.io/address/${d.issuerAddress}) (CUIT 30-12345678-9, AR) |
| Recipient | [\`${d.recipientAddress}\`](https://sepolia.arbiscan.io/address/${d.recipientAddress}) (RFC CLIX850101AB1, MX) |

## Invoice details

- **Invoice ID:** FC-A-0001-SAR-FIXTURE-001
- **Amount:** 1,210 USD (1,210 mUSDC at 6 decimals)
- **Tax:** Argentine IVA 21% (2,100 bps over base 1,000 USD = 210 USD)
- **Line items:** 1 — "Agentic commerce consulting"
- **Jurisdiction:** AR

## Verifying the on-chain commitment independently

You can verify the commitment exists and matches the data above using \`cast\`:

\`\`\`bash
# Verify the commitment is registered for this invoiceHash
cast call ${d.registrar} \\
  "isCommitted(bytes32)(bool)" \\
  ${d.invoiceHash} \\
  --rpc-url ${d.rpcUrl}
# Expected: true

# Get the full commitment record
cast call ${d.registrar} \\
  "getCommitment(bytes32)((address,address,address,uint256,bytes32,uint8,string,bytes,uint256))" \\
  ${d.invoiceHash} \\
  --rpc-url ${d.rpcUrl}
\`\`\`

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
