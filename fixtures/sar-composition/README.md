# VIC + SAR Composition Fixture

This directory contains a concrete on-chain VIC commitment on Arbitrum Sepolia,
designed to compose with [SAR (Settlement Attestation Receipt)](https://github.com/x402-foundation/x402/issues/1195)
via the `_ext.invoice` namespace.

The composition was discussed and agreed in [x402 issue #1195](https://github.com/x402-foundation/x402/issues/1195),
with the layer separation:

- **VIC** answers: *what was invoiced, with what tax breakdown, in what fiscal jurisdiction?*
- **operation-binding** answers: *what operation was the payment for?*
- **SAR** answers: *was the operation delivered correctly?*

## Files

- `invoice.json` — the full signed VIC Invoice (EIP-712 typed data + issuer signature).
- `commitment-data.json` — on-chain commitment data with all transaction hashes and Arbiscan links.
- `ext-invoice.json` — drop-in `_ext.invoice` payload for inclusion in SAR receipts.
- `README.md` — this file.

## Composition payload

The following payload can be inserted into a SAR receipt's `_ext` envelope to reference this VIC commitment:

```json
{
  "_ext": {
    "invoice": {
      "schema_id": "vic.invoice.v1",
      "invoice_hash": "0xad9cfdcbd843098786ad0f84068c8810246706e1ffaa1969bba83948352dea2c",
      "chain_id": 421614,
      "registrar": "0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD",
      "payment_tx_ref": "0x7e9480557acd0eeebb416e683d01f0524b1e313d8e09abbb9866d5e78b245381"
    }
  }
}
```

## Verification flow (6-step cross-layer audit)

The agreed verification flow from x402 issue #1195:

1. **Read SAR receipt** with `defaultsettle verify <receipt.json>`.
2. **Extract `_ext.invoice`** from the receipt.
3. **Fetch VIC commitment** from `registrar` on `chain_id` using `invoice_hash`. Read the `InvoiceCommitted` event log.
4. **Verify** the commitment's `paymentTxRef` matches `_ext.invoice.payment_tx_ref`.
5. **Verify SAR signature** independently against keys at `https://defaultverifier.com/.well-known/sar-keys.json`.
6. **Treat the pair** as a composed cross-layer audit fixture, not as either layer subsuming the other.

This 6-step flow is the audit trail a tax authority or compliance layer could replay independently.

## On-chain data

| Property | Value |
|----------|-------|
| Chain | Arbitrum Sepolia (chain_id: 421614) |
| VIC Registrar | [`0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD`](https://sepolia.arbiscan.io/address/0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD) |
| Invoice Hash | `0xad9cfdcbd843098786ad0f84068c8810246706e1ffaa1969bba83948352dea2c` |
| Payment Tx | [`0x7e9480557acd0eeebb416e683d01f0524b1e313d8e09abbb9866d5e78b245381`](https://sepolia.arbiscan.io/tx/0x7e9480557acd0eeebb416e683d01f0524b1e313d8e09abbb9866d5e78b245381) (block 280574071) |
| Commit Tx | [`0x58ec74baaaaadf376fdff892fefb897d43019fb3fc880510f5e3c6b61a8a15a2`](https://sepolia.arbiscan.io/tx/0x58ec74baaaaadf376fdff892fefb897d43019fb3fc880510f5e3c6b61a8a15a2) (block 280574076) |
| Mock USDC | [`0x3Af7F644A147F75004E022a8623bf14FEb9AFf6d`](https://sepolia.arbiscan.io/address/0x3Af7F644A147F75004E022a8623bf14FEb9AFf6d) |
| Issuer | [`0xD096D1326Cd60bd322ce8A2F7d462735Bf65Ba13`](https://sepolia.arbiscan.io/address/0xD096D1326Cd60bd322ce8A2F7d462735Bf65Ba13) (CUIT 30-12345678-9, AR) |
| Recipient | [`0xef58a240401d47de0CbeCCAFf814f90d65b30Ea0`](https://sepolia.arbiscan.io/address/0xef58a240401d47de0CbeCCAFf814f90d65b30Ea0) (RFC CLIX850101AB1, MX) |

## Invoice details

- **Invoice ID:** FC-A-0001-SAR-FIXTURE-001
- **Amount:** 1,210 USD (1,210 mUSDC at 6 decimals)
- **Tax:** Argentine IVA 21% (2,100 bps over base 1,000 USD = 210 USD)
- **Line items:** 1 — "Agentic commerce consulting"
- **Jurisdiction:** AR

## Verifying the on-chain commitment independently

You can verify the commitment exists and matches the data above using `cast`:

```bash
# Verify the commitment is registered for this invoiceHash
cast call 0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD \
  "isCommitted(bytes32)(bool)" \
  0xad9cfdcbd843098786ad0f84068c8810246706e1ffaa1969bba83948352dea2c \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
# Expected: true

# Get the full commitment record
cast call 0xa8C5b7D5B413297343ca6CeCe3931F9770D7A2FD \
  "getCommitment(bytes32)((address,address,address,uint256,bytes32,uint8,string,bytes,uint256))" \
  0xad9cfdcbd843098786ad0f84068c8810246706e1ffaa1969bba83948352dea2c \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

## Reproducing the SAR side

The composed SAR receipt with `_ext.invoice` referencing this commitment will be hosted in
[`sar-sdk` fixtures](https://github.com/xmandate-ai/sar-sdk) once produced by the SAR side.

A reference SAR receipt can be generated locally with:

```bash
pipx install git+https://github.com/nutstrut/defaultsettle-cli.git
defaultsettle speedrun
```

This produces a baseline SAR receipt (without `_ext.invoice`). The composition happens when
the SAR side embeds the `ext-invoice.json` payload from this directory into the receipt's
`_ext` envelope.

## References

- VIC EIP draft: [../../eip/eip-vic.md](../../eip/eip-vic.md)
- VIC paper (SSRN): [Mateos, J. (2026)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6795482)
- SAR proposal: [x402 issue #1195](https://github.com/x402-foundation/x402/issues/1195)
- VIC + SAR composition discussion: [x402 issue #1195 (composition thread)](https://github.com/x402-foundation/x402/issues/1195)
- VIC FacilitatorExtension hook PR: [x402 PR #2339](https://github.com/x402-foundation/x402/pull/2339)
