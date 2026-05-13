// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {InvoiceCommitmentRegistry}  from "../src/InvoiceCommitmentRegistry.sol";
import {InvoiceCommitmentTypes}     from "../src/InvoiceCommitmentTypes.sol";

/// @title InvoiceCommitmentRegistryTest
/// @notice Foundry test suite for the VIC reference registrar.
contract InvoiceCommitmentRegistryTest is Test {
    InvoiceCommitmentRegistry internal registry;

    uint256 internal issuerPrivateKey = 0xA11CE;
    address internal issuer;
    address internal recipient = address(0xBEEF);
    address internal randomUser = address(0xCAFE);

    function setUp() public {
        registry = new InvoiceCommitmentRegistry();
        issuer = vm.addr(issuerPrivateKey);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    function _buildInvoice(uint256 nonce)
        internal
        view
        returns (InvoiceCommitmentTypes.Invoice memory inv)
    {
        InvoiceCommitmentTypes.TaxEntry[] memory taxes =
            new InvoiceCommitmentTypes.TaxEntry[](1);
        taxes[0] = InvoiceCommitmentTypes.TaxEntry({
            taxType: "IVA",
            taxScheme: "AR-IVA-21",
            rateBps: 2100,
            baseAmountMilliUnits: 1_000_000,
            taxAmountMilliUnits:    210_000
        });

        InvoiceCommitmentTypes.LineItem[] memory items =
            new InvoiceCommitmentTypes.LineItem[](1);
        items[0] = InvoiceCommitmentTypes.LineItem({
            description: "Consultoria Q2 2026",
            quantityScaled: 1000,
            unit: "EA",
            unitPriceMilliUnits: 1_000_000,
            lineTotalMilliUnits: 1_000_000,
            taxRefIndex: 0
        });

        inv = InvoiceCommitmentTypes.Invoice({
            invoiceId: "FC-A-0001-00000123",
            issueDate: 1745452800,
            dueDate:   1748044800,
            paymentTerms: "Net 30",
            purchaseOrderRef: "",
            issuer: issuer,
            issuerTaxId: InvoiceCommitmentTypes.TaxIdentity({
                scheme: "AR-CUIT",
                id: "30-12345678-9"
            }),
            recipient: recipient,
            recipientTaxId: InvoiceCommitmentTypes.TaxIdentity({
                scheme: "MX-RFC",
                id: "CLIX850101AB1"
            }),
            paymentToken: address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48),
            paymentAmount: 1_210_000_000,
            fiatCurrency: "USD",
            fiatAmountMilliUnits: 1_210_000,
            fxRateScaled: 0,
            fxOracle: address(0),
            fxTimestamp: 0,
            taxes: taxes,
            lineItems: items,
            jurisdiction: "AR",
            regulatoryData: "",
            nonce: nonce
        });
    }

    function _sign(InvoiceCommitmentTypes.Invoice memory inv)
        internal
        view
        returns (bytes memory sig, bytes32 digest)
    {
        digest = registry.hashInvoice(inv);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerPrivateKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Happy path
    // ─────────────────────────────────────────────────────────────────────

    function test_CommitValidInvoice_OffChainMode() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(1);
        (bytes memory sig, bytes32 digest) = _sign(inv);

        bytes32 returnedHash = registry.commitInvoice(
            inv,
            bytes32(uint256(0xDEAD)),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "ipfs://bafy...",
            "",
            sig
        );

        assertEq(returnedHash, digest);
        assertTrue(registry.isNonceUsed(issuer, 1));

        (address storedIssuer, address storedRecipient, bytes32 storedTxRef) =
            registry.getCommitment(digest);
        assertEq(storedIssuer, issuer);
        assertEq(storedRecipient, recipient);
        assertEq(storedTxRef, bytes32(uint256(0xDEAD)));
    }

    function test_CommitValidInvoice_EncryptedMode() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(2);
        (bytes memory sig, ) = _sign(inv);

        bytes memory ciphertext = hex"DEADBEEF1234";

        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.EncryptedOnChain,
            "",
            ciphertext,
            sig
        );

        assertTrue(registry.isNonceUsed(issuer, 2));
    }

    function test_CommitCallableByThirdParty() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(3);
        (bytes memory sig, ) = _sign(inv);

        vm.prank(randomUser);
        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "",
            "",
            sig
        );

        assertTrue(registry.isNonceUsed(issuer, 3));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rejection paths
    // ─────────────────────────────────────────────────────────────────────

    function test_RevertsOnInvalidSignature() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(4);
        bytes32 digest = registry.hashInvoice(inv);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(InvoiceCommitmentRegistry.InvalidSignature.selector);
        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "",
            "",
            badSig
        );
    }

    function test_RevertsOnReplayedNonce() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(5);
        (bytes memory sig, ) = _sign(inv);

        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "",
            "",
            sig
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceCommitmentRegistry.NonceAlreadyUsed.selector,
                issuer,
                5
            )
        );
        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "",
            "",
            sig
        );
    }

    function test_RevertsIfEncryptedPayloadMissingInEncryptedMode() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(6);
        (bytes memory sig, ) = _sign(inv);

        vm.expectRevert(InvoiceCommitmentRegistry.EncryptedPayloadRequired.selector);
        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.EncryptedOnChain,
            "",
            "",
            sig
        );
    }

    function test_RevertsIfEncryptedPayloadProvidedInOffChainMode() public {
        InvoiceCommitmentTypes.Invoice memory inv = _buildInvoice(7);
        (bytes memory sig, ) = _sign(inv);

        vm.expectRevert(InvoiceCommitmentRegistry.EncryptedPayloadForbidden.selector);
        registry.commitInvoice(
            inv,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "",
            hex"BAADF00D",
            sig
        );
    }

    function test_DifferentNoncesDoNotCollide() public {
        InvoiceCommitmentTypes.Invoice memory inv1 = _buildInvoice(100);
        InvoiceCommitmentTypes.Invoice memory inv2 = _buildInvoice(200);

        (bytes memory sig1, ) = _sign(inv1);
        (bytes memory sig2, ) = _sign(inv2);

        registry.commitInvoice(
            inv1,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "", "", sig1
        );
        registry.commitInvoice(
            inv2,
            bytes32(0),
            InvoiceCommitmentTypes.PayloadMode.OffChain,
            "", "", sig2
        );

        assertTrue(registry.isNonceUsed(issuer, 100));
        assertTrue(registry.isNonceUsed(issuer, 200));
    }

    function test_DomainSeparatorIsNonZero() public view {
        bytes32 ds = registry.domainSeparator();
        assertTrue(ds != bytes32(0));
    }
}
