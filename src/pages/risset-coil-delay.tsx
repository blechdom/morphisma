import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const RissetCoilDelay = dynamic(
  () =>
    import("@/components/experiments/RissetCoilDelay").then(
      (m) => m.RissetCoilDelay
    ),
  { ssr: false }
);

export default function RissetCoilDelayPage() {
  return (
    <>
      <Head>
        <title>Risset Coil Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <RissetCoilDelay />
      </div>
    </>
  );
}
