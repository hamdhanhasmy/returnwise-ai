import Link from "next/link";
import { Brand } from "@/components/brand";
export default function EvidencePrivacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <Brand />
      <h1 className="text-3xl font-semibold">Product evidence privacy</h1>
      <p>
        ReturnWise stores product photos privately for the merchant reviewing
        your case. Uploading does not grant permission to send them to an AI
        provider. You can use description-only human review.
      </p>
      <p>
        Hosted uploads are stored in a private Supabase Storage bucket; the
        application database retains scoped metadata. Existing local evidence
        may remain as private PostgreSQL bytes. Access passes through authorized
        ReturnWise server routes, without public storage links. Supabase is a
        separate storage processor; ask your merchant about its project region
        and retention arrangements before uploading.
      </p>
      <h2 className="text-xl font-semibold">Optional DeepSeek processing</h2>
      <p>
        With your separate permission, an authorized merchant can send your case
        description and current product images to DeepSeek for observations. No
        order/customer identifiers, prices, payment records or merchant policies
        are included. Images are normalized without metadata and reduced in size
        without cropping. Visual text remains visible; remove personal
        information before uploading.
      </p>
      <p>
        DeepSeek is based in China and its published privacy policy describes
        processing there. Its general privacy policy does not cover downstream
        applications such as ReturnWise. We do not promise zero retention,
        training exclusion or deletion of evidence already transmitted. Consult
        the provider terms and ask your merchant before sharing sensitive
        material.
      </p>
      <p>
        <a
          className="text-primary underline"
          href="https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html"
          target="_blank"
          rel="noreferrer"
        >
          DeepSeek Open Platform terms
        </a>
        {" · "}
        <a
          className="text-primary underline"
          href="https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html"
          target="_blank"
          rel="noreferrer"
        >
          DeepSeek privacy policy
        </a>
      </p>
      <h2 className="text-xl font-semibold">Your controls</h2>
      <p>
        You can remove a photo or withdraw AI permission using your private case
        link while the case is open. Withdrawal prevents future analysis
        attempts but cannot recall an in-flight request or previously sent data.
        AI assessments are advisory and a human must review them. You may
        request human review without AI.
      </p>
      <p>
        Image access expires after 30 days. The operator must run the documented
        retention cleanup to remove expired image bytes and private objects.
        Failed remote deletion stays tracked for retry and may delay physical
        erasure; access is revoked immediately. Database backups may retain
        copies under the operator’s backup policy. Case descriptions, assessment
        history and minimal consent/usage audit records are retained for review.
        Contact your merchant for access, deletion or retention questions. This
        prototype is intended for synthetic Sandbox evidence; real customer use
        requires a reviewed retention and provider-processing arrangement.
      </p>
      <Link className="text-primary" href="/returns">
        Return to the customer portal →
      </Link>
    </main>
  );
}
