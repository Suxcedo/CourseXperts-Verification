
 // ==========================================
 // CONFIGURATION
 // ==========================================

const CONTRACT_ADDRESS =
    "0xc419bDB0A694c235F9C2a770c7D64E7F2e1cdC58";

const FUJI_RPC_URL =
    "https://api.avax-test.network/ext/bc/C/rpc";

const BACKEND_API_URL =
    "http://localhost:5000/api/certificates";

const EXPLORER_URL =
    "https://testnet.snowtrace.io";


// ==========================================
// BLOCKCHAIN CONNECTION
// ==========================================

async function getCertificateContract() {

    const provider = new ethers.JsonRpcProvider(FUJI_RPC_URL);

    const abiResponse = await fetch("./contract-abi.json");

    if (!abiResponse.ok) {
        throw new Error("Could not load the smart contract ABI.");
    }

    const abi = await abiResponse.json();

    return new ethers.Contract(
        CONTRACT_ADDRESS,
        abi,
        provider
    );

}


// ==========================================
// CERTIFICATE ID CONVERSION
// ==========================================

function convertCertificateId(certificateUUID) {

    return ethers.id(
        String(certificateUUID).trim()
    );

}


// ==========================================
// PUBLIC CERTIFICATE API
// ==========================================

async function getPublicCertificate(certificateUUID) {

    const url =
        `${BACKEND_API_URL}/public/${encodeURIComponent(certificateUUID)}`;

    const response = await fetch(url);

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(
            data.message ||
            "Could not retrieve this certificate."
        );
    }

    return data.certificate;

}


// ==========================================
// PDF HASH CALCULATION
// ==========================================

async function calculatePDFHash(file) {

    const fileBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        fileBuffer
    );

    const hashArray = Array.from(
        new Uint8Array(hashBuffer)
    );

    const hashHex = hashArray
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    return "0x" + hashHex;

}


// ==========================================
// BLOCKCHAIN CERTIFICATE VERIFICATION
// ==========================================

async function getBlockchainCertificate(certificateUUID) {

    const blockchainCertificateId =
        convertCertificateId(certificateUUID);

    console.log(
        "Blockchain certificate ID:",
        blockchainCertificateId
    );

    const contract = await getCertificateContract();

    const certificate = await contract.getCertificate(
        blockchainCertificateId
    );

    const storedHash = certificate[0];
    const issuer = certificate[1];
    const issuedAt = Number(certificate[2]);
    const revoked = certificate[3];
    const exists = certificate[4];

    const blockchainDetails = {
        certificateHash: storedHash,
        issuer,
        issuedAt,
        issuedAtFormatted: issuedAt
            ? new Date(issuedAt * 1000).toLocaleString()
            : "Not available",
        revoked,
        exists
    };

    console.log(
        "Blockchain certificate record:",
        blockchainDetails
    );

    if (!exists) {
        throw new Error(
            "This certificate was not found on the blockchain."
        );
    }

    if (revoked) {
        throw new Error(
            "This certificate has been revoked and is no longer valid."
        );
    }

    return {
        storedHash,
        issuer,
        issuedAt,
        revoked,
        exists
    };

}


// ==========================================
// PDF VERIFICATION
// ==========================================

async function verifyPDF(file, storedHash) {

    if (!file) {
        throw new Error("Please select a certificate PDF.");
    }

    if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
    ) {
        throw new Error("The selected file must be a PDF.");
    }

    console.log("Calculating uploaded PDF hash...");

    const uploadedHash = await calculatePDFHash(file);

    console.log("Uploaded PDF hash:", uploadedHash);
    console.log("Blockchain hash:", storedHash);

    const isMatch =
        uploadedHash.toLowerCase() ===
        storedHash.toLowerCase();

    return {
        valid: isMatch,
        uploadedHash,
        storedHash
    };

}


// ==========================================
// HTML DISPLAY HELPERS
// ==========================================

function escapeHTML(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]
    );

}


function formatIssueDate(dateValue) {

    if (!dateValue) {
        return "Not available";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString(
        undefined,
        {
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );

}


function shortenHash(hash) {

    if (!hash || hash.length < 30) {
        return hash || "Not available";
    }

    return `${hash.substring(0, 18)}...${hash.substring(hash.length - 12)}`;

}


// ==========================================
// DISPLAY BLOCKCHAIN EVIDENCE
// ==========================================

function displayBlockchainDetails(
    certificateUUID,
    blockchainCertificate,
    pdfResult,
    certificate = null
) {

    const resultArea =
        document.getElementById("result");

    const learnerName = certificate?.learner_name
        ? escapeHTML(certificate.learner_name)
        : null;

    const courseName = certificate?.course_name
        ? escapeHTML(certificate.course_name)
        : null;

    const certificateDate = certificate?.issued_at
        ? formatIssueDate(certificate.issued_at)
        : blockchainCertificate.issuedAt
            ? new Date(
                blockchainCertificate.issuedAt * 1000
            ).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric"
            })
            : "Not available";

    const transactionHash =
        certificate?.blockchain_transaction_hash || null;

    const network =
        certificate?.blockchain_network || "Avalanche Fuji Testnet";

    const uploadedHash = pdfResult?.uploadedHash || null;

    const storedHash =
        blockchainCertificate.storedHash;

    const issuer =
        blockchainCertificate.issuer;

    const certificateId =
        certificate?.certificate_id || certificateUUID;

    const transactionSection = transactionHash
        ? `
            <div class="evidence-item full-width">
                <span class="evidence-label">
                    Blockchain Transaction Hash
                </span>

                <div class="hash-value">
                    ${escapeHTML(transactionHash)}
                </div>

                <a
                    class="explorer-link"
                    href="${EXPLORER_URL}/tx/${encodeURIComponent(transactionHash)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View transaction on Avalanche Explorer ↗
                </a>
            </div>
        `
        : "";

    resultArea.innerHTML = `
        <div class="blockchain-evidence">

            <div class="evidence-header">
                <div>
                    <span class="section-eyebrow">
                        ON-CHAIN VERIFICATION
                    </span>

                    <h3>Blockchain Evidence</h3>

                    <p>
                        The following information was retrieved
                        directly from the Avalanche smart contract.
                    </p>
                </div>

                <span class="network-badge">
                    Avalanche Fuji
                </span>
            </div>


            <div class="evidence-grid">

                ${learnerName ? `
                    <div class="evidence-item">
                        <span class="evidence-label">Learner</span>
                        <strong>${learnerName}</strong>
                    </div>
                ` : ""}

                ${courseName ? `
                    <div class="evidence-item">
                        <span class="evidence-label">Course</span>
                        <strong>${courseName}</strong>
                    </div>
                ` : ""}

                <div class="evidence-item full-width">
                    <span class="evidence-label">
                        Certificate ID
                    </span>

                    <strong class="break-value">
                        ${escapeHTML(certificateId)}
                    </strong>
                </div>

                <div class="evidence-item">
                    <span class="evidence-label">
                        Blockchain Status
                    </span>

                    <strong class="verified-text">
                        Registered and Not Revoked
                    </strong>
                </div>

                <div class="evidence-item">
                    <span class="evidence-label">
                        Blockchain Network
                    </span>

                    <strong>${escapeHTML(network)}</strong>
                </div>

                <div class="evidence-item">
                    <span class="evidence-label">
                        Registration Timestamp
                    </span>

                    <strong>
                        ${blockchainCertificate.issuedAt
                            ? escapeHTML(
                                new Date(
                                    blockchainCertificate.issuedAt * 1000
                                ).toLocaleString()
                            )
                            : "Not available"}
                    </strong>
                </div>

                <div class="evidence-item">
                    <span class="evidence-label">
                        Certificate Issue Date
                    </span>

                    <strong>${escapeHTML(certificateDate)}</strong>
                </div>

                <div class="evidence-item full-width">
                    <span class="evidence-label">
                        Smart Contract Address
                    </span>

                    <div class="hash-value">
                        ${CONTRACT_ADDRESS}
                    </div>

                    <a
                        class="explorer-link"
                        href="${EXPLORER_URL}/address/${CONTRACT_ADDRESS}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        View smart contract on Avalanche Explorer ↗
                    </a>
                </div>

                <div class="evidence-item full-width">
                    <span class="evidence-label">
                        Issuer Wallet Address
                    </span>

                    <div class="hash-value">
                        ${escapeHTML(issuer)}
                    </div>

                    <a
                        class="explorer-link"
                        href="${EXPLORER_URL}/address/${encodeURIComponent(issuer)}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        View issuer wallet on Avalanche Explorer ↗
                    </a>
                </div>

                <div class="evidence-item full-width">
                    <span class="evidence-label">
                        Original SHA-256 Hash Stored on Blockchain
                    </span>

                    <div class="hash-value">
                        ${escapeHTML(storedHash)}
                    </div>
                </div>

                ${uploadedHash ? `
                    <div class="evidence-item full-width">
                        <span class="evidence-label">
                            Uploaded PDF SHA-256 Hash
                        </span>

                        <div class="hash-value">
                            ${escapeHTML(uploadedHash)}
                        </div>

                        <span class="${pdfResult.valid ? "verified-text" : "failed-text"}">
                            ${pdfResult.valid
                                ? "✓ Hash matches the blockchain record"
                                : "✕ Hash does not match the blockchain record"}
                        </span>
                    </div>
                ` : ""}

                ${transactionSection}

            </div>

            <div class="evidence-footer">
                <span class="evidence-check">✓</span>

                <p>
                    Blockchain information retrieved successfully
                    from the deployed smart contract.
                </p>
            </div>

        </div>
    `;

}


// ==========================================
// DISPLAY VERIFICATION RESULTS
// ==========================================

function displayVerificationResult(
    title,
    message,
    status
) {

    const resultArea =
        document.getElementById("result");

    const icon = status === "success" ? "✓" : "✕";

    resultArea.innerHTML += `
        <div class="verification-result ${status}">

            <div class="result-status-icon">
                ${icon}
            </div>

            <div class="result-status-content">

                <span class="section-eyebrow">
                    ${status === "success"
                        ? "VERIFICATION SUCCESSFUL"
                        : "VERIFICATION FAILED"}
                </span>

                <h3>${escapeHTML(title)}</h3>

                <p>${escapeHTML(message)}</p>

            </div>

        </div>
    `;

}


// ==========================================
// METHOD A: VERIFY ID + PDF
// ==========================================

async function verifyCertificateWithPDF(
    certificateUUID,
    file
) {

    console.log(
        "Using direct blockchain PDF verification..."
    );

    // Retrieve the certificate directly from Avalanche.

    const blockchainCertificate =
        await getBlockchainCertificate(certificateUUID);

    // Calculate and compare the uploaded PDF hash.

    const pdfResult = await verifyPDF(
        file,
        blockchainCertificate.storedHash
    );

    // Display the real blockchain evidence.

    displayBlockchainDetails(
        certificateUUID,
        blockchainCertificate,
        pdfResult
    );

    if (pdfResult.valid) {

        displayVerificationResult(
            "Certificate Authentic",
            "The uploaded PDF matches the original SHA-256 hash stored on Avalanche. The certificate exists on the blockchain and has not been revoked.",
            "success"
        );

        console.log(
            "SUCCESS: Certificate and PDF verified."
        );

    } else {

        displayVerificationResult(
            "Document Verification Failed",
            "The uploaded PDF does not match the original SHA-256 hash stored on the blockchain. The document may have been modified or may not be the original certificate.",
            "error"
        );

        console.log(
            "FAILED: PDF hash does not match."
        );

    }

    return {
        valid: pdfResult.valid,
        documentVerified: pdfResult.valid,
        blockchainCertificate,
        pdfResult
    };

}


// ==========================================
// METHOD B: VERIFY ID ONLY
// ==========================================

async function verifyCertificateWithID(certificateUUID) {

    console.log(
        "Retrieving certificate details from CourseXperts..."
    );

    const certificate =
        await getPublicCertificate(certificateUUID);

    console.log(
        "Certificate details retrieved:",
        certificate
    );

    const blockchainCertificate =
        await getBlockchainCertificate(certificateUUID);

    displayBlockchainDetails(
        certificateUUID,
        blockchainCertificate,
        null,
        certificate
    );

    displayVerificationResult(
        "Certificate Authentic",
        "The certificate was found in CourseXperts and its blockchain record is valid and has not been revoked. Upload the original PDF to verify document integrity.",
        "success"
    );

    return {
        valid: true,
        documentVerified: false,
        certificate,
        blockchainCertificate
    };

}


// ==========================================
// MAIN VERIFICATION PROCESS
// ==========================================

async function verifyCertificate(
    certificateUUID,
    file
) {

    console.log("Starting certificate verification...");

    if (
        !certificateUUID ||
        !certificateUUID.trim()
    ) {
        throw new Error(
            "Please enter your certificate ID."
        );
    }

    if (file) {

        return await verifyCertificateWithPDF(
            certificateUUID,
            file
        );

    }

    return await verifyCertificateWithID(
        certificateUUID
    );

}


// ==========================================
// PAGE INITIALISATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const certificateForm =
        document.getElementById("verificationForm");

    const certificateIdInput =
        document.getElementById("certificateId");

    const pdfInput =
        document.getElementById("certificateFile");

    const fileNameDisplay =
        document.getElementById("fileName");

    const resultArea =
        document.getElementById("result");

    const verifyButton =
        document.getElementById("verifyButton");

    const currentYear =
        document.getElementById("currentYear");


    // ======================================
    // QR CODE CERTIFICATE ID AUTOFILL
    // ======================================

    const urlParams =
        new URLSearchParams(window.location.search);

    const certificateIdFromURL =
        urlParams.get("id");

    if (certificateIdFromURL && certificateIdInput) {

        certificateIdInput.value =
            certificateIdFromURL.trim();

        console.log(
            "Certificate ID automatically loaded from QR code:",
            certificateIdFromURL
        );

    }


    // ======================================
    // INITIAL PAGE SETTINGS
    // ======================================

    pdfInput.required = false;

    if (currentYear) {
        currentYear.textContent =
            new Date().getFullYear();
    }


    // ======================================
    // PDF FILE SELECTION
    // ======================================

    pdfInput.addEventListener("change", () => {

        const file = pdfInput.files[0];

        if (file) {

            fileNameDisplay.textContent =
                file.name;

        } else {

            fileNameDisplay.textContent =
                "Upload your certificate PDF";

        }

    });


    // ======================================
    // FORM SUBMISSION
    // ======================================

    certificateForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const certificateUUID =
                certificateIdInput.value.trim();

            const file =
                pdfInput.files[0];

            resultArea.className = "result";
            resultArea.innerHTML = "";

            resultArea.classList.remove("hidden");

            // Keep the original simple loading message.

            resultArea.textContent =
                "Verifying certificate...";

            verifyButton.disabled = true;

            verifyButton.textContent =
                "Verifying...";


            try {

                const result = await verifyCertificate(
                    certificateUUID,
                    file
                );

                console.log(
                    "Final verification result:",
                    result
                );

            } catch (error) {

                console.error(
                    "Certificate verification error:",
                    error
                );

                resultArea.innerHTML = "";

                displayVerificationResult(
                    "Verification Unsuccessful",
                    error.message ||
                    "An unexpected error occurred during verification.",
                    "error"
                );

            } finally {

                verifyButton.disabled = false;

                verifyButton.innerHTML =
                    'Verify Certificate <span>→</span>';

            }

        }
    );

});
