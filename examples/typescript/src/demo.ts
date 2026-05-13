/**
 * End-to-end demonstration of Verifiable Invoice Commitment (VIC).
 *
 * Flow:
 *   0. Deploy the InvoiceCommitmentRegistry and a mock ERC-20 (acting as USDC).
 *   1. Issuer constructs an invoice (Argentine company billing 1,210 USD to a
 *      Mexican recipient, with 21% IVA, paid in 1,210 USDC).
 *   2. Issuer signs the invoice with EIP-712.
 *   3. Issuer transfers USDC to the recipient (the on-chain payment).
 *   4. Issuer commits the invoice referencing the payment tx.
 *   5. Recipient verifies all four properties: hash agreement, signature
 *      validity, payment match, structural tax invariant.
 *
 * Prerequisites:
 *   - Anvil running at http://127.0.0.1:8545 (run `anvil` in another terminal).
 *   - Forge has built the contracts (the demo reads the compiled artifact).
 */

import { readFileSync } from "node:fs";
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

const RPC_URL = "http://127.0.0.1:8545";

// Anvil's deterministic test accounts. NEVER use these on any real network.
const ANVIL_DEPLOYER_PK   = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_ISSUER_PK     = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ANVIL_RECIPIENT_PK  = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// Minimal in-line mock ERC-20: standard mintable token. We deploy it from raw
// bytecode + ABI so the demo runs without external dependencies. The bytecode
// below was compiled from a trivial ERC20 implementing Transfer events
// compatible with the verifyPaymentTx logic in recipient.ts.
//
// For simplicity, we use OpenZeppelin's ERC20 deployed via inline solidity at
// runtime. Since we do not have the artifact compiled here, we instead rely on
// a minimal deploy pattern using ethers' deployContract with a pre-compiled
// OpenZeppelin bytecode shipped as part of the demo.
//
// In practice: most users of VIC will be using real stablecoin deployments
// (USDC, USDT). The mock token here is purely for the demo.

// Load the compiled registry artifact produced by `forge build`.
const REGISTRY_ARTIFACT_PATH = resolve(
  __dirname,
  "../../../contracts/out/InvoiceCommitmentRegistry.sol/InvoiceCommitmentRegistry.json",
);

function loadRegistryArtifact(): { abi: any[]; bytecode: string } {
  const raw = readFileSync(REGISTRY_ARTIFACT_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    abi: parsed.abi,
    bytecode: parsed.bytecode.object,
  };
}

const MOCK_ERC20_ABI = [
  "constructor(string name, string symbol)",
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

/**
 * Minimal ERC-20 source compiled at demo bootstrap. Uses solc through a CLI
 * call — but to avoid that complexity, we ship the runtime-compiled bytecode
 * inline. For the demo, we instead deploy a contract dynamically using the
 * bytecode emitted by forge for a sample MockERC20.
 *
 * To keep this self-contained: we read OpenZeppelin's compiled artifact from
 * the contracts/out directory if present; otherwise we instruct the user to
 * provide one.
 */
const MOCK_ERC20_ARTIFACT_PATH = resolve(
  __dirname,
  "../../../contracts/out/MockERC20.sol/MockERC20.json",
);

function loadMockERC20Artifact(): { abi: any[]; bytecode: string } | null {
  try {
    const raw = readFileSync(MOCK_ERC20_ARTIFACT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { abi: parsed.abi, bytecode: parsed.bytecode.object };
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n┌──────────────────────────────────────────────────────┐");
  console.log("│  Verifiable Invoice Commitment — End-to-End Demo     │");
  console.log("└──────────────────────────────────────────────────────┘\n");

  const provider = new JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  console.log(`Connected to chain ${chainId}\n`);

  const deployer        = new Wallet(ANVIL_DEPLOYER_PK,   provider);
  const issuerWallet    = new Wallet(ANVIL_ISSUER_PK,     provider);
  const recipientWallet = new Wallet(ANVIL_RECIPIENT_PK,  provider);

  // Reset Anvil to genesis so the demo is idempotent across re-runs.
  // The RPC method is Anvil-specific; on other nodes this silently no-ops.
  try {
    await provider.send("anvil_reset", []);
  } catch { /* not running on Anvil — proceed with current state */ }

  // ── Step 0: deploy contracts ──
  console.log("[0] Deploying contracts...");

  // Ethers v6 can race on nonce when two deploys happen in quick succession
  // against Anvil's instant-mining. Fetch once and track manually.
  let deployerNonce = await deployer.getNonce("pending");

  const regArtifact = loadRegistryArtifact();
  const registryFactory = new ContractFactory(
    regArtifact.abi,
    regArtifact.bytecode,
    deployer,
  );
  const registry = await registryFactory.deploy({ nonce: deployerNonce++ });
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`    Registry:   ${registryAddress}`);

  const erc20Artifact = loadMockERC20Artifact();
  if (!erc20Artifact) {
    console.error(
      "\n  ✗ MockERC20 artifact not found at contracts/out/MockERC20.sol/MockERC20.json",
    );
    console.error(
      "    Create contracts/src/MockERC20.sol with a minimal ERC-20 implementation,",
    );
    console.error("    then run `cd contracts && forge build` and try again.\n");
    process.exit(1);
  }

  const usdcFactory = new ContractFactory(
    erc20Artifact.abi,
    erc20Artifact.bytecode,
    deployer,
  );
  const usdc = await usdcFactory.deploy("Mock USDC", "mUSDC", { nonce: deployerNonce++ });
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  const usdcAsDeployer = new Contract(usdcAddress, MOCK_ERC20_ABI, deployer);
  await (await usdcAsDeployer.mint(issuerWallet.address, 10_000_000_000n, { nonce: deployerNonce++ })).wait();
  console.log(`    Mock USDC:  ${usdcAddress}`);
  console.log(`    Minted 10,000 mUSDC to issuer\n`);

  // ── Step 1: build invoice ──
  console.log("[1] Issuer constructs invoice...");
  const invoice: Invoice = {
    invoiceId: "FC-A-0001-00000123",
    issueDate: BigInt(Math.floor(Date.parse("2026-04-26T10:30:00Z") / 1000)),
    dueDate:   BigInt(Math.floor(Date.parse("2026-05-26T10:30:00Z") / 1000)),
    paymentTerms: "Net 30",
    purchaseOrderRef: "",

    issuer: issuerWallet.address,
    issuerTaxId: { scheme: "AR-CUIT", id: "30-12345678-9" },
    recipient: recipientWallet.address,
    recipientTaxId: { scheme: "MX-RFC", id: "CLIX850101AB1" },

    paymentToken: usdcAddress,
    paymentAmount: 1_210_000_000n,        // 1,210 USDC at 6 decimals
    fiatCurrency: "USD",
    fiatAmountMilliUnits: 1_210_000n,     // 1,210.000 USD
    fxRateScaled: 100_000_000n,           // 1.00000000 (USDC ≈ USD)
    fxOracle: ethers.ZeroAddress,
    fxTimestamp: BigInt(Math.floor(Date.now() / 1000)),

    taxes: [{
      taxType: "IVA",
      taxScheme: "AR-IVA-21",
      rateBps: 2100n,
      baseAmountMilliUnits: 1_000_000n,
      taxAmountMilliUnits:    210_000n,
    }],
    lineItems: [{
      description: "Consultoria Q2 2026",
      quantityScaled: 1000n,
      unit: "EA",
      unitPriceMilliUnits: 1_000_000n,
      lineTotalMilliUnits: 1_000_000n,
      taxRefIndex: 0n,
    }],

    jurisdiction: "AR",
    regulatoryData: "0x",
    nonce: 1n,
  };
  console.log(`    Invoice ID: ${invoice.invoiceId}`);
  console.log(`    Amount:     1,210.00 USD (1,210 mUSDC)\n`);

  // ── Step 2: sign ──
  console.log("[2] Issuer signs the invoice with EIP-712...");
  const issuer = new InvoiceIssuer(issuerWallet, registryAddress, chainId);
  const signed = await issuer.signInvoice(invoice);
  console.log(`    Hash:       ${signed.invoiceHash}`);
  console.log(`    Signature:  ${signed.signature.slice(0, 22)}...${signed.signature.slice(-20)}\n`);

  const agree = await verifyHashAgreement(
    provider, registryAddress, invoice, signed.invoiceHash,
  );
  console.log(`    Off-chain hash == on-chain hash: ${agree ? "YES ✓" : "NO ✗"}\n`);
  if (!agree) {
    throw new Error("Hash mismatch between TS and Solidity. Aborting.");
  }

  // ── Step 3: pay ──
  console.log("[3] Issuer transfers 1,210 mUSDC to recipient...");
  const usdcAsIssuer = new Contract(usdcAddress, MOCK_ERC20_ABI, issuerWallet);
  // Track issuer nonce explicitly — same ethers v6 / Anvil auto-mine race as deployer.
  let issuerNonce = await issuerWallet.getNonce("pending");
  const paymentTx = await usdcAsIssuer.transfer(
    recipientWallet.address,
    invoice.paymentAmount,
    { nonce: issuerNonce++ },
  );
  const paymentReceipt = await paymentTx.wait();
  console.log(`    Payment tx: ${paymentReceipt!.hash}\n`);

  // ── Step 4: commit ──
  console.log("[4] Committing invoice on-chain...");
  const { txHash: commitTxHash, invoiceHash } = await issuer.commit(
    provider,
    signed,
    paymentReceipt!.hash,
    PayloadMode.OffChain,
    "ipfs://bafy...example",
    "0x",
    { nonce: issuerNonce++ },
  );
  console.log(`    Commit tx:  ${commitTxHash}`);
  console.log(`    Hash:       ${invoiceHash}\n`);

  // ── Step 5: verify ──
  console.log("[5] Recipient verifies the committed invoice...");
  const recipient = new InvoiceRecipient(registryAddress, chainId);
  const result = await recipient.verify(
    provider,
    signed.json,
    invoiceHash,
    paymentReceipt!.hash,
  );

  console.log(`    Signature valid:   ${result.signatureValid    ? "YES ✓" : "NO ✗"}`);
  console.log(`    Hash matches:      ${result.hashMatches       ? "YES ✓" : "NO ✗"}`);
  console.log(`    Payment matches:   ${result.paymentMatches    ? "YES ✓" : "NO ✗"}`);
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

  console.log(`\n${allPass ? "✓ All checks passed." : "✗ Verification failed."}\n`);

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
