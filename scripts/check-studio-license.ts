import "dotenv/config";
import { AgStudioLicenseManager } from "ag-studio";
// Version-pinned vendor diagnostic only. This internal helper is not an authorization grant.
const key = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
if (!key) {
  console.log("No Studio licence configured");
  process.exitCode = 1;
} else {
  try {
    const d = AgStudioLicenseManager.getLicenseDetails(
      key,
      new Set(["CORE", "PRO", "PRO-AI"]),
    );
    console.log(
      JSON.stringify({
        vendorValidation: d.valid,
        incorrectLicenseType: d.incorrectLicenseType ?? false,
        suppliedLicenseType: d.suppliedLicenseType ?? null,
        isTrial: d.isTrial ?? null,
        expiry: d.expiry ?? null,
        expired: d.expired ?? false,
        hostedPermission:
          "requires confirmation of supplied trial terms and domain; not established by this diagnostic",
      }),
    );
    if (!d.valid || d.incorrectLicenseType || d.expired) process.exitCode = 1;
  } catch {
    console.error("Studio licence diagnostic unavailable; no key was printed.");
    process.exitCode = 1;
  }
}
