import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const ShepardDelayGlobalFeedback = dynamic(
  () =>
    import("@/components/experiments/ShepardDelayGlobalFeedback").then(
      (m) => m.ShepardDelayGlobalFeedback
    ),
  { ssr: false }
);

export default function ShepardDelayGlobalFeedbackPage() {
  return (
    <>
      <Head>
        <title>Shepard Delay — Global Feedback — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <ShepardDelayGlobalFeedback />
      </div>
    </>
  );
}
