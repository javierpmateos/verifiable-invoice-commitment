# Contributing to Verifiable Invoice Commitment (VIC)

Thanks for your interest in VIC. This document explains where and how to
contribute productively.

## Where discussion happens

| Channel                    | Use it for                                              |
| -------------------------- | ------------------------------------------------------- |
| [Ethereum Magicians thread] | High-level design, schema changes, scope decisions.    |
| GitHub Issues              | Concrete bugs, type drift, test failures, doc errors.   |
| Pull Requests              | Code, documentation, or descriptor changes.             |

[Ethereum Magicians thread]: https://ethereum-magicians.org/

Design conversations belong on Ethereum Magicians. Implementation
conversations belong here. Both are welcome.

## What kinds of contributions are welcome

- **Bug reports** with a minimal reproducer (Solidity test or TypeScript
  snippet) showing the unexpected behaviour against the latest `main`.
- **Documentation fixes**: typos, broken links, clarifications. Open a PR
  directly.
- **Implementation improvements** that do not change the EIP semantics
  (gas optimisations, clearer error messages, better assertion coverage).
- **Companion ERC drafts** for jurisdictional `regulatoryData` schemas
  (Argentina CAE, Mexico CFDI, Italy Codice Destinatario, etc.). Open an
  Issue first so we can coordinate the registry of jurisdiction codes.
- **Reference deployments** on additional EVM chains using the canonical
  CREATE2 salt. Open an Issue with the chain ID, the transaction hash,
  and the verified-source link.
- **Translations** of the README or the EIP draft into Spanish,
  Portuguese, Italian, etc. — community implementations often start in
  the implementer's own language.

## What is out of scope right now

- Changes to the schema that break EIP-712 type compatibility. The
  `Invoice` struct fields and their order are part of the standard's
  invariants until version 2.
- Renaming the registrar contract or its event signatures.
- Changing the canonical CREATE2 salt.

These will only be revisited if the Ethereum Magicians thread reaches
consensus on a v2.

## Development setup

Prerequisites:

- [Foundry](https://book.getfoundry.sh/) (forge, anvil, cast)
- Node.js ≥ 20
- Git with submodule support (`git --version` ≥ 2.x)

Clone with submodules:

```bash
git clone --recursive https://github.com/javierpmateos/verifiable-invoice-commitment.git
cd verifiable-invoice-commitment
```

If you already cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

Build and test the Solidity:

```bash
cd contracts
forge build
forge test -vv
```

All 9 tests should pass on a clean clone.

Run the end-to-end TypeScript demo against a local Anvil node:

```bash
# Terminal 1
anvil

# Terminal 2
cd examples/typescript
npm install
npm run demo
```

## Pull request checklist

Before opening a PR:

1. `forge test -vv` passes locally on your branch.
2. `npx tsc --noEmit` in `examples/typescript/` is clean.
3. New behaviour is covered by at least one Foundry test or a TypeScript
   assertion in the demo flow.
4. The commit message is in the imperative mood ("Add X", "Fix Y") and
   under ~72 characters per line in the subject.
5. If the change affects the EIP draft (`eip/eip-vic.md`) or the ERC-7730
   descriptor (`erc7730/eip712-VerifiableInvoiceCommitment.json`), the
   diff is explained in the PR description.

CI will run the full Solidity build + test suite and the TypeScript
typecheck on every PR. Both must pass before review.

## Code style

- **Solidity:** Solidity 0.8.26. Custom errors over `require` strings.
  Natspec on every external function and event. No unchecked blocks
  outside of arithmetic that is proven safe by surrounding logic.
- **TypeScript:** strict mode (`strict: true` in `tsconfig.json`). No
  `any` outside of intentionally untyped boundaries (JSON parsing). Use
  `bigint` for all integer values that originate on-chain.
- **EIP draft:** follow the Markdown conventions of `ethereum/ERCs`. RFC
  2119 keywords are reserved for normative statements.

## Reporting security issues

Security-sensitive issues that affect the reference implementation should
be reported privately first, before public disclosure. Open a draft
security advisory at:

https://github.com/javierpmateos/verifiable-invoice-commitment/security/advisories/new

For non-sensitive bugs (e.g., a tests-failure-on-Apple-Silicon kind of
issue), regular GitHub Issues are fine.

## License

By contributing to this repository, you agree that your contributions
will be released under [CC0 1.0 Universal](./LICENSE), the same license
as the rest of the project. This places the work in the public domain
and is the canonical license for EIP reference implementations.
