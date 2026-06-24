# Verifiable Invoice Commitment (VIC)

> A standard for binding structured accounting metadata — equivalent to a
> traditional invoice or fiscal receipt — to on-chain payment transactions
> on EVM blockchains, without modifying existing token contracts.

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](./LICENSE)
[![EIP: Draft](https://img.shields.io/badge/EIP-Draft-orange.svg)](./eip/eip-vic.md)
[![Tests: 9/9](https://img.shields.io/badge/tests-9%2F9-brightgreen.svg)](./contracts/test/)
[![CI](https://github.com/javierpmateos/verifiable-invoice-commitment/actions/workflows/ci.yml/badge.svg)](https://github.com/javierpmateos/verifiable-invoice-commitment/actions/workflows/ci.yml)

## Academic Paper

A preprint of this work is published at SSRN:

**Mateos, J. (2026). Verifiable Invoice Commitment: An EVM-Native Standard for Committing Fiscal Metadata to On-Chain Payments.** SSRN.
https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6795482

## What this is

VIC is a proposed Ethereum standard that lets a commercial invoice — with
fiscal identifiers, tax breakdown, FX context, line items, and
jurisdictional data — be cryptographically committed alongside an on-chain
payment, in a way that any party (counterparty, auditor, tax authority) can
later verify independently.

The invoice itself stays off-chain by default. Only its EIP-712 hash and an
optional URI are committed on-chain via a deterministically deployable
singleton registrar (CREATE2, identical address on every EVM chain).
Privacy is preserved: prices, discounts, and counterparty identities do not
appear in plaintext on a public ledger. A companion ERC-7730 descriptor lets
hardware wallets render the invoice in human-readable form at signing.

## Why this exists

On-chain stablecoin payments have reached commercial maturity. The US–MX
corridor moved more than $6.5B in stablecoin remittances in 2024. The
Machine Payments Protocol (Stripe/Tempo, March 2026) and x402 (Coinbase)
standardized payment rails for autonomous agents. Chainlink ACE/CCIP
integrated ISO 20022 messaging with major financial institutions throughout
2025. Yet the **accounting layer** that traditionally accompanies a payment
— the invoice — has no canonical EVM representation.

After multi-round literature review (see the preprint for citations), no
existing ERC, institutional spec, or production project covers the
composition VIC defines: EIP-712 typed Invoice + singleton CREATE2
registrar + payment-tx binding + dual off-chain/encrypted mode +
jurisdictional opaque extension + composability with the modern ERC stack.

Adjacent precedents address related but distinct problems:

- **ERC-7699** introduces an opaque `bytes reference` field with no
  semantic structure.
- **ERC-7963** (Ant International, 2025) targets ISO 20022 institutional
  settlement, not commercial invoicing — no tax breakdown or line items.
- **ITU-T F.751.4** (2022) frames DLT-based invoices at recommendation
  level without an EVM realization.
- **W3C Commercial Invoice VC** uses JSON-LD + DIDs without on-chain
  commitment.
- **EIP-965** (2018, abandoned) anticipated the signed-cheque pattern but
  never advanced beyond Draft.

VIC closes the gap.

## Repository structure

```text
.
├── eip/
│   └── eip-vic.md              The full EIP in canonical Ethereum format.
├── contracts/                  Solidity reference implementation.
│   ├── src/
│   │   ├── InvoiceCommitmentTypes.sol     Shared structs.
│   │   ├── InvoiceHasher.sol              EIP-712 hashing library.
│   │   ├── InvoiceCommitmentRegistry.sol  Singleton registrar.
│   │   └── MockERC20.sol                  Demo-only token.
│   ├── script/Deploy.s.sol     CREATE2 deterministic deployment.
│   └── test/                   Foundry test suite (9 tests, all passing).
├── erc7730/
│   └── eip712-VerifiableInvoiceCommitment.json
│                               Clear-signing descriptor for hardware wallets.
├── examples/typescript/        End-to-end demo with ethers.js v6.
└── docs/                       Preprint abstract, paper skeleton, post drafts.
```

## Quick start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) (forge, anvil)
- Node.js ≥ 20

### Run the reference demo

```bash
# Terminal 1 — local EVM
anvil

# Terminal 2 — build and run
cd contracts && forge build && cd ..
cd examples/typescript && npm install && npm run demo
```

You should see the issuer sign an invoice, the payment go through, the
commitment be anchored, and the recipient verify all four properties:
signature validity, hash agreement, payment match, and tax invariant.

### Run the test suite

```bash
cd contracts
forge test -vv
```

All 9 tests should pass.

### Compute an invoice hash off-chain (TypeScript)

```typescript
import { ethers } from "ethers";
import {
  EIP712_TYPES,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from "./types";

const domain = {
  name: EIP712_DOMAIN_NAME,
  version: EIP712_DOMAIN_VERSION,
  chainId: 1n,
  verifyingContract: REGISTRY_ADDRESS,
};

const invoiceHash = ethers.TypedDataEncoder.hash(
  domain,
  EIP712_TYPES,
  invoice,
);
```

## Canonical deployment addresses

The registrar deploys deterministically via CREATE2 with the salt
`keccak256("ERC-XXXX.VerifiableInvoiceCommitment.v1")`, yielding the same
address on every EVM chain.

| Chain     | Chain ID | Address                                       | Status     |
| --------- | -------- | --------------------------------------------- | ---------- |
| Ethereum  | 1        | _pending mainnet deployment_                   | Planned    |
| Optimism  | 10       | _pending_                                      | Planned    |
| Polygon   | 137      | _pending_                                      | Planned    |
| Base      | 8453     | _pending_                                      | Planned    |
| Arbitrum  | 42161    | _pending_                                      | Planned    |
| Sepolia   | 11155111 | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD` | Live (verified) |
| Base Sepolia | 84532 | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD` | Live (verified) |
| Arbitrum Sepolia | 421614 | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD` | Live (verified) |

Testnet contracts are verified and source code is publicly auditable:

- [Sepolia (Etherscan)](https://sepolia.etherscan.io/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code)
- [Base Sepolia (Basescan)](https://sepolia.basescan.org/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code)
- [Arbitrum Sepolia (Arbiscan)](https://sepolia.arbiscan.io/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD#code)

Mainnet deployments are deferred until the EIP reaches `Last Call`.

## Composability

VIC composes with, and does not replace, existing standards:

| Standard      | Relationship                                                  |
| ------------- | ------------------------------------------------------------- |
| **EIP-712**   | Foundation; the `Invoice` struct is canonical typed data.     |
| **ERC-7730**  | Companion descriptor for clear signing (provided in this repo). |
| **ERC-7699**  | The `invoiceHash` MAY be placed in ERC-7699's `reference`.    |
| **EIP-3009**  | The `invoiceHash` MAY serve as `nonce` in `transferWithAuthorization`. |
| **ERC-4337**  | Commitment + payment MAY be bundled in one `UserOperation`.   |
| **ERC-7943**  | Commitment MAY be invoked from `canTransfer` hooks for RWAs.  |
| **MPP**       | The `invoiceHash` MAY appear in MPP `Payment-Receipt` headers. |
| **SAR**       | The VIC commitment MAY be referenced from a SAR receipt's `_ext.invoice` envelope. See [composition fixture](fixtures/sar-composition/). |

A concrete composition fixture (VIC + SAR cross-layer audit pair) is published in [`fixtures/sar-composition/`](fixtures/sar-composition/), with the SAR-side fixture hosted in [`nutstrut/defaultsettlement-sdk`](https://github.com/nutstrut/defaultsettlement-sdk/tree/main/packages/sar-402/examples/vic-sar-composition). Composition discussion: [x402 issue #1195](https://github.com/x402-foundation/x402/issues/1195).

## Status

| Milestone                                                    | Status      |
| ------------------------------------------------------------ | ----------- |
| EIP draft published                                          | ✓ Done       |
| Reference implementation (Solidity + tests)                  | ✓ Done       |
| ERC-7730 clear-signing descriptor                            | ✓ Done       |
| TypeScript end-to-end demo                                   | ✓ Done       |
| Posted to Ethereum Magicians for discussion                  | ✓ Done      |
| PR submitted to `ethereum/ERCs`                               | Pending     |
| Reference deployment on Sepolia / Base Sepolia / Arbitrum    | ✓ Done      |
| Preprint on SSRN                                             | ✓ Done      |
| ERC-7730 descriptor submitted to Ledger registry             | Pending     |
| EIP advances to `Review`                                     | Pending     |
| Mainnet canonical deployments                                | Pending     |

Live discussion thread:
https://ethereum-magicians.org/t/erc-verifiable-invoice-commitment-vic-fiscal-metadata-anchored-to-on-chain-payments-via-eip-712-singleton-registrar/28547

Substantive design feedback is welcome on the thread. Implementation issues
belong in this repository's Issues.

## Citing VIC

If you use VIC in academic work, please cite the preprint:

```bibtex
@misc{mateos2026vic,
  author       = {Javier Mateos},
  title        = {Verifiable Invoice Commitment: An EVM-Native Standard
                  for Committing Fiscal Metadata to On-Chain Payments},
  year         = {2026},
  howpublished = {SSRN preprint},
  url          = {https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6795482},
  note         = {Also published as ERC-XXXX (Draft).
                  ORCID: 0009-0003-0596-1708.}
}
```

## Contributing

Issues and pull requests are welcome. Substantive design discussion happens
on the [Ethereum Magicians thread][magicians]. For typos, code fixes, or
clarifications, open a PR directly against this repository.

[magicians]: https://ethereum-magicians.org/t/erc-verifiable-invoice-commitment-vic-fiscal-metadata-anchored-to-on-chain-payments-via-eip-712-singleton-registrar/28547

## Acknowledgments

This proposal was informed by review of ERC-7699 (Radek Svarz), ERC-7963
(Ant International), ERC-7943 (uRWA), ERC-7730 (Laurent Castillo, Ledger),
ITU-T F.751.4, the W3C Traceability Vocabulary, EIP-965 (Šatkevič and
Ressin), and the broader ERC community discussion on accounting metadata
in on-chain payments. Multi-round literature review was conducted with
independent verification of each claimed precedent.

## License

This work is dedicated to the public domain under
[CC0 1.0 Universal](./LICENSE).

---

**Author:** Javier Mateos
**Affiliation:** Independent Researcher (Affiliated Collaborator,
Tecnología Blockchain, Universidad Nacional de Mar del Plata)
**ORCID:** [0009-0003-0596-1708](https://orcid.org/0009-0003-0596-1708)
**Contact:** javierpmateos@gmail.com
**Location:** Rosario, Argentina
