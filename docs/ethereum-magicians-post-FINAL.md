# ERC: Verifiable Invoice Commitment (VIC) — fiscal metadata anchored to on-chain payments via EIP-712 + singleton registrar

Hi all,

I'd like to introduce a proposal for discussion: **Verifiable Invoice
Commitment (VIC)**, a standard for binding structured fiscal metadata to
on-chain payments without modifying any token contract.

- **Repository:** https://github.com/javierpmateos/verifiable-invoice-commitment
- **Full draft EIP:** https://github.com/javierpmateos/verifiable-invoice-commitment/blob/main/eip/eip-vic.md
- **Reference implementation:** https://github.com/javierpmateos/verifiable-invoice-commitment/tree/main/contracts

## TL;DR

A commercial payment in stablecoins on EVM today carries no canonical
record of *what was paid for, by whom, under which fiscal regime, with
what tax breakdown*. Companies maintain parallel off-chain databases
mapping `txHash` to internal invoice records. Auditors and tax
authorities cannot independently verify the binding.

VIC defines that binding cryptographically:

1. An **EIP-712 typed `Invoice` struct** with fields for issuer/recipient
   tax IDs (CUIT, RFC, EU-VAT, US-EIN, OTHER), fiat currency and FX rate
   (Chainlink-aligned scaling), tax breakdown array (with type, scheme,
   rateBps, base, amount), line items array (UN/CEFACT-aligned units),
   and jurisdictional `regulatoryData` bytes for jurisdiction-specific
   extensions.
2. A **singleton registrar** (`InvoiceCommitmentRegistry`)
   deterministically deployable via CREATE2 to the same address on every
   EVM chain. It validates the issuer's EIP-712 signature, prevents
   replay via arbitrary per-issuer nonces, and emits an
   `InvoiceCommitted` event.
3. A **dual payload mode**: off-chain (default — only the hash and an
   optional URI are public) or encrypted on-chain (the encrypted payload
   travels in the event for cases without a coordination channel).
4. A **companion ERC-7730 descriptor** so hardware wallets render the
   invoice in human-readable form at signing.

The default mode minimizes public disclosure: only the commitment hash
and the parties' addresses appear on-chain. In off-chain mode, erasure of
the off-chain invoice document renders the on-chain commitment a hash
without recoverable preimage — a property intended to support
GDPR-oriented data minimization and erasure workflows.

The reference implementation is complete: 9/9 Foundry tests passing, an
end-to-end TypeScript demo (Argentine company billing 1,210 USD to a
Mexican recipient with 21% IVA, paid in 1,210 USDC), and an ERC-7730
descriptor ready for submission to the Ledger registry. All under CC0.

## Why a new ERC

I reviewed adjacent ERCs/EIPs, institutional frameworks, and production
systems. None of the candidates I found covers the composition. If a
precedent I missed exists, I would value the correction.

**Adjacent ERCs and EIPs:**

- **ERC-7699** (Radek Svarz, 2024) introduces an opaque `bytes reference`
  field and explicitly declines to define its semantic structure. VIC's
  `invoiceHash` is exactly the kind of value that `reference` was
  designed to carry; we compose with it rather than replace it.
- **ERC-7963** (Ant International, May 2025) standardizes ISO
  20022-aligned payment instructions but the JSON lives off-chain and
  the schema targets institutional settlement, omitting tax breakdown,
  line items, and FX context.
- **ERC-7943** (uRWA, Review) and **ERC-7972** (Compliance Router) define
  compliance hooks for RWAs without per-transfer accounting metadata.
- **EIP-681** and **ERC-7856** are pre-transaction URIs that don't
  persist on-chain.
- The `bytes data` extensions (ERC-223/677/777/1363) permit arbitrary
  payload but standardize no semantics.
- LSP4/LSP2 on LUKSO offer flexible KV metadata but no canonical keys
  for fiscal identifiers or invoice line items.
- **EIP-965** (Šatkevič and Ressin, 2018, Draft, abandoned) anticipated
  the signed-cheque-with-invoice pattern but used opaque bytes.
- **ERC-1513** (Tallyx, 2018, Draft, abandoned) tokenized payment
  obligations as refungible NFTs — a different problem (asset
  representation, not commitment of transfer-time metadata).

**Outside the EIP space:**

- **ITU-T F.751.4** (March 2022) frames the problem at recommendation
  level for DLT generally; not EVM-native.
- **W3C Commercial Invoice VC** uses JSON-LD + DIDs without on-chain
  commitment.
- **Recibo** (Circle, January 2026) is a smart-contract wrapper with
  encrypted messages but defines no schema for the plaintext content.
- **Request Network** is a proprietary protocol, not an open ERC.
- Production stablecoin invoicing tools (invoice.build, Polytrade,
  Centrifuge, etc.) work around the gap with private databases.

I welcome correction if a precedent I missed exists.

## Composability with the modern ERC stack

VIC composes with, and does not replace:

- **EIP-712**: foundation of the schema.
- **ERC-7730**: companion descriptor included in the repo.
- **ERC-7699**: the `invoiceHash` MAY be placed in its `reference` field.
- **EIP-3009**: the `invoiceHash` MAY serve as `nonce` for
  `transferWithAuthorization`, binding the commitment directly into the
  signed transfer authorization.
- **ERC-4337**: commitment and payment MAY be bundled atomically in a
  `UserOperation`.
- **ERC-7943**: a uRWA implementer MAY invoke `commitInvoice` from its
  `canTransfer` hook, gating compliant transfers behind accounting
  metadata.
- **MPP** (Stripe/Tempo, March 2026): the `invoiceHash` MAY appear in
  the `Payment-Receipt` HTTP header, providing the accounting layer MPP
  itself does not specify.

## Open questions for discussion

A few design choices I'd particularly value feedback on.

**Q1 — Arbitrary-nonce vs monotonic-nonce for replay protection.** I
went with arbitrary because it permits parallel issuance without state
coordination on the issuer side. The trade-off is that a monotonic
counter would expose less issuance-volume metadata. Open to arguments
either way.

**Q2 — Whether `lineItems` should live in the core or in a companion
ERC.** I argue core, with permitted empty arrays, on the grounds that
virtually all national fiscal regimes require itemized discrimination
(Argentina IVA, Mexico CFDI, EU VAT, etc.) and the gas cost of an empty
array is negligible. Counter-arguments welcome.

**Q3 — The `regulatoryData` bytes opaque field, with jurisdictional
sub-schemas deferred to companion ERCs** (one per country: Argentina
for CAE, Mexico for UUID/PAC, Italy for Codice Destinatario, etc.).
This mirrors how EIP-712 itself defers type definitions to
implementers. I considered a bound enum or a discriminated union and
both produced spec bloat that would not survive review. Sanity-check
welcome.

**Q4 — Encrypted-on-chain payload mode.** Is the option valuable
enough to keep, or does it risk encouraging long-term ciphertext
storage on a public ledger that future cryptanalytic advances could
break? I lean toward keeping it as opt-in with a Security
Considerations warning, but I'm open to deprecating it.

**Q5 — Whether the term "commitment" correctly communicates the
cryptographic semantics to implementers.** The name was chosen because
*commitment* is precise in cryptography (a binding, hiding scheme over a
value), whereas *anchor* — the obvious alternative — is heavily
overloaded in the space (Anchor Protocol on Terra/Luna, Stellar's
"anchor" terminology for fiat gateways, Anchor as a fintech billing
platform). The risk is that "commitment" reads as abstract to
implementers unfamiliar with commitment schemes, which is exactly the
audience this standard targets (accounting teams, not cryptographers).
Open to alternatives.

## What is in the repo today

- Full EIP draft in canonical Markdown format.
- Solidity reference implementation (Solidity 0.8.26, OpenZeppelin v5):
  three files (`InvoiceCommitmentTypes.sol`, `InvoiceHasher.sol`,
  `InvoiceCommitmentRegistry.sol`), with full Foundry test suite (9
  tests, all passing) covering happy path, replay rejection, signature
  failure, payload-mode invariants, third-party submission, nonce
  isolation, and domain-separator validity.
- ERC-7730 clear-signing descriptor with verified field ordering and
  internationalizable enums (AR-CUIT, MX-RFC, EU-VAT, US-EIN, OTHER).
- TypeScript end-to-end demonstration with ethers.js v6: issuer signs,
  payment is sent, commitment is anchored, recipient verifies the four
  properties (signature validity, hash agreement, payment match,
  structural tax invariant).
- Deterministic CREATE2 deployment script.
- Cross-validation of the off-chain hash against the on-chain
  `hashInvoice` view function — verifies consistency between the
  Solidity and TypeScript EIP-712 encodings.

The reference registrar is deployed at the same canonical CREATE2 address on all three Sepolia testnets:

**`0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD`**

Source code is verified and available for inspection:

- Sepolia (Etherscan): https://sepolia.etherscan.io/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code
- Base Sepolia (Basescan): https://sepolia.basescan.org/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code
- Arbitrum Sepolia (Arbiscan): https://sepolia.arbiscan.io/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code

The deployment uses the deterministic salt `keccak256("ERC-XXXX.VerifiableInvoiceCommitment.v1")`. Mainnet deployments are deferred until the EIP reaches Last Call.

## Next steps

I plan to open a PR against `ethereum/ERCs` once initial feedback is
incorporated. I'll also be reaching out to authors of adjacent
standards (ERC-7699 by Radek Svarz, ERC-7963 by Ant International,
ERC-7943, ERC-7730 by Laurent Castillo at Ledger) and to LATAM payment
processors for whom this is operationally relevant. Discussion in this
thread takes priority.

Looking forward to feedback, especially on the open questions above.

— Javier Mateos
Independent Researcher (Affiliated Collaborator, Tecnología Blockchain, Universidad Nacional de Mar del Plata)
ORCID: [0009-0003-0596-1708](https://orcid.org/0009-0003-0596-1708)
