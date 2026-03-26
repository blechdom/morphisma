import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const SimpleTapeDelay = dynamic(
  () =>
    import("@/components/experiments/SimpleTapeDelay").then(
      (m) => m.SimpleTapeDelay
    ),
  { ssr: false }
);

export default function SimpleTapeDelayPage() {
  return (
    <>
      <Head>
        <title>Simple Tape Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <SimpleTapeDelay />
      </div>
    </>
  );
}
