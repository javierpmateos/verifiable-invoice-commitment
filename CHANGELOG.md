# Changelog

All notable changes to **Verifiable Invoice Commitment (VIC)** are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-release tags (`-draft`, `-rc`, etc.) indicate that the standard has not yet been
accepted into the canonical `ethereum/ERCs` repository. Once accepted, the project
will move to `1.0.0` and breaking-change rules apply.

## [Unreleased]

### Announced

- 2026-05-13: Published on Ethereum Magicians for community discussion.
  [Thread](https://ethereum-magicians.org/t/erc-verifiable-invoice-commitment-vic-fiscal-metadata-anchored-to-on-chain-payments-via-eip-712-singleton-registrar/28547).

### Planned

- Reference deployments on Ethereum mainnet, Optimism, Polygon, Base, Arbitrum.
- ERC-7730 descriptor submitted to the LedgerHQ clear-signing registry.
- Companion EIP drafts for jurisdictional `regulatoryData` schemas (AR, MX, IT).
- Pull request opened against `ethereum/ERCs`.
- Preprint published on SSRN.

## [0.1.0-draft] — 2026-05-13

### Added

- **EIP draft** in canonical Ethereum format (`eip/eip-vic.md`).
- **Solidity reference implementation** (Solidity 0.8.26, OpenZeppelin v5.6.1):
  - `InvoiceCommitmentTypes.sol` — shared struct definitions.
  - `InvoiceHasher.sol` — EIP-712 struct-hash library.
  - `InvoiceCommitmentRegistry.sol` — singleton registrar.
  - `MockERC20.sol` — demo-only token with 6 decimals.
  - `Deploy.s.sol` — deterministic CREATE2 deployment script.
- **Foundry test suite**: 9 tests covering the happy path for both payload modes,
  replay rejection, signature failure, payload-mode invariants, third-party
  submission, nonce isolation, and domain separator validity.
- **ERC-7730 clear-signing descriptor** (`erc7730/eip712-VerifiableInvoiceCommitment.json`)
  with field ordering optimised for hardware-wallet display and internationalisable
  enums for tax identity schemes and tax types.
- **TypeScript end-to-end demo** (`examples/typescript/`) using ethers.js v6, with
  cross-validation of off-chain hash against the on-chain `hashInvoice` view function.
- **Documentation**: SSRN preprint abstract, academic paper skeleton in LaTeX,
  ready-to-post Ethereum Magicians thread body.
- **GitHub Actions CI** running `forge build`, `forge test -vv`, and `tsc --noEmit`
  on every push and pull request.

### Testnet deployments

The reference registrar is deployed via deterministic CREATE2 (salt
`keccak256("ERC-XXXX.VerifiableInvoiceCommitment.v1")`) at the same canonical
address on three Sepolia testnets:

| Chain             | Chain ID  | Address                                       |
| ----------------- | --------- | --------------------------------------------- |
| Sepolia           | 11155111  | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD`  |
| Base Sepolia      | 84532     | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD`  |
| Arbitrum Sepolia  | 421614    | `0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD`  |

Source code is verified and publicly auditable on each chain's block explorer.

### Notes

This is the **initial community draft**. It has not yet been submitted to the
`ethereum/ERCs` repository. Feedback is requested on the
[Ethereum Magicians thread](https://ethereum-magicians.org/) before opening a
formal PR.

[Unreleased]: https://github.com/javierpmateos/verifiable-invoice-commitment/compare/v0.1.0-draft...HEAD
[0.1.0-draft]: https://github.com/javierpmateos/verifiable-invoice-commitment/releases/tag/v0.1.0-draft
