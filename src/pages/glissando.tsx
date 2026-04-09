import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const ShepardRisset = dynamic(
  () =>
    import("@/components/experiments/ShepardRisset").then(
      (m) => m.ShepardRisset
    ),
  { ssr: false }
);

export default function GlissandoPage() {
  return (
    <>
      <Head>
        <title>Shepard-Risset Glissando — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link" style={{ color: "#ff4444" }}>
          ← morphisma
        </Link>
        <ShepardRisset />
      </div>
    </>
  );
}
