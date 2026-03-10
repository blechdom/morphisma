import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const RissetTapeDelay = dynamic(
  () =>
    import("@/components/experiments/RissetTapeDelay").then(
      (m) => m.RissetTapeDelay
    ),
  { ssr: false }
);

export default function RissetTapeDelayPage() {
  return (
    <>
      <Head>
        <title>Risset Tape Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <RissetTapeDelay />
      </div>
    </>
  );
}
