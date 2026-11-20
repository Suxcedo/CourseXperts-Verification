
 // ==========================================
 // CONFIGURATION
 // ==========================================

const CONTRACT_ADDRESS =
    "0xc419bDB0A694c235F9C2a770c7D64E7F2e1cdC58";

const FUJI_RPC_URL =
    "https://api.avax-test.network/ext/bc/C/rpc";

const BACKEND_API_URL =
    "http://localhost:5000/api/certificates";


// ==========================================
// BLOCKCHAIN CONNECTION
// ==========================================

async function getCertificateContract() {

    const provider = new ethers.JsonRpcProvider(
        FUJI_RPC_URL
    );

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

    console.log("Blockchain certificate record:", {
        certificateHash: storedHash,
        issuer,
        issuedAt: new Date(issuedAt * 1000).toLocaleString(),
        revoked,
        exists
    });

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

        throw new Error(
            "The selected file must be a PDF."
        );

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


// ==========================================
// DISPLAY CERTIFICATE DETAILS
// ==========================================

function displayCertificateDetails(certificate) {

    const resultArea =
        document.getElementById("result");

    const learnerName =
        escapeHTML(certificate.learner_name);

    const courseName =
        escapeHTML(certificate.course_name);

    const certificateId =
        escapeHTML(certificate.certificate_id);

    const issueDate =
        escapeHTML(
            formatIssueDate(certificate.issued_at)
        );

    const transactionHash =
        escapeHTML(
            certificate.blockchain_transaction_hash ||
            "Not available"
        );

    const network =
        escapeHTML(
            certificate.blockchain_network ||
            "Not available"
        );

    const pdfURL =
        escapeHTML(certificate.certificate_pdf_url);

    resultArea.innerHTML = `
        <div class="certificate-details">

            <h3>Certificate Details</h3>

            <p>
                <strong>Learner:</strong>
                ${learnerName}
            </p>

            <p>
                <strong>Course:</strong>
                ${courseName}
            </p>

            <p>
                <strong>Certificate ID:</strong>
                ${certificateId}
            </p>

            <p>
                <strong>Issue Date:</strong>
                ${issueDate}
            </p>

            <p>
                <strong>Blockchain Status:</strong>
                Registered
            </p>

            <p>
                <strong>Blockchain Network:</strong>
                ${network}
            </p>

            <p>
                <strong>Transaction Hash:</strong>
                <span class="transaction-hash">
                    ${transactionHash}
                </span>
            </p>

            <p>
                <a
                    href="${pdfURL}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View Original Certificate PDF
                </a>
            </p>

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

    resultArea.innerHTML += `
        <div class="verification-result ${status}">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
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

    // No backend API request is made here.

    const blockchainCertificate =
        await getBlockchainCertificate(certificateUUID);

    const pdfResult = await verifyPDF(
        file,
        blockchainCertificate.storedHash
    );

    if (pdfResult.valid) {

        displayVerificationResult(
            "Certificate Authentic",
            "The uploaded PDF matches the hash stored on Avalanche. The certificate exists and has not been revoked.",
            "success"
        );

        console.log(
            "SUCCESS: Certificate and PDF verified."
        );

    } else {

        displayVerificationResult(
            "Document Verification Failed",
            "The uploaded PDF does not match the original certificate hash stored on the blockchain.",
            "error"
        );

        console.log(
            "FAILED: PDF hash does not match."
        );

    }

    return {
        valid: pdfResult.valid,
        documentVerified: true,
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

    // This method requires the backend.

    const certificate =
        await getPublicCertificate(certificateUUID);

    console.log(
        "Certificate details retrieved:",
        certificate
    );

    displayCertificateDetails(certificate);

    console.log(
        "Checking certificate on Avalanche..."
    );

    const blockchainCertificate =
        await getBlockchainCertificate(certificateUUID);

    displayVerificationResult(
        "Certificate Authentic",
        "The certificate was found in CourseXperts and its blockchain record is valid and has not been revoked. Upload the PDF separately if you also want to verify the document's integrity.",
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

async function verifyCertificate(certificateUUID, file) {

    console.log("Starting certificate verification...");

    if (
        !certificateUUID ||
        !certificateUUID.trim()
    ) {

        throw new Error(
            "Please enter your certificate ID."
        );

    }

    // If a PDF is selected, use direct blockchain
    // verification without contacting the backend.

    if (file) {

        return await verifyCertificateWithPDF(
            certificateUUID,
            file
        );

    }

    // If no PDF is selected, retrieve certificate
    // details using the public backend API.

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


    // PDF upload is optional.

    pdfInput.required = false;


    // Display current year.

    if (currentYear) {

        currentYear.textContent =
            new Date().getFullYear();

    }


    // Display selected PDF filename.

    pdfInput.addEventListener("change", () => {

        const file = pdfInput.files[0];

        if (file) {

            fileNameDisplay.textContent =
                file.name;

            console.log(
                "Selected certificate:",
                file.name
            );

        } else {

            fileNameDisplay.textContent =
                "Upload your certificate PDF";

        }

    });


    // Handle verification form submission.

    certificateForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const certificateUUID =
                certificateIdInput.value.trim();

            const file =
                pdfInput.files[0];

            resultArea.className = "hidden";
            resultArea.innerHTML = "";

            resultArea.classList.remove("hidden");

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
