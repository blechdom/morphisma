import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const BipolarBreakdownDelay = dynamic(
  () =>
    import("@/components/experiments/BipolarBreakdownDelay").then(
      (m) => m.BipolarBreakdownDelay
    ),
  { ssr: false }
);

export default function BipolarBreakdownDelayPage() {
  return (
    <>
      <Head>
        <title>Bipolar Breakdown Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link" style={{ color: "#cc88dd" }}>
          ← morphisma
        </Link>
        <BipolarBreakdownDelay />
      </div>
    </>
  );
}
