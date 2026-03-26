import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const CandyCoilDelay = dynamic(
  () =>
    import("@/components/experiments/CandyCoilDelay").then(
      (m) => m.CandyCoilDelay
    ),
  { ssr: false }
);

export default function CandyCoilDelayPage() {
  return (
    <>
      <Head>
        <title>Candy Coil Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <CandyCoilDelay />
      </div>
    </>
  );
}
