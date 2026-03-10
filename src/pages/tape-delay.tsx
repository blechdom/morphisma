import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const TapeDelay = dynamic(
  () =>
    import("@/components/experiments/TapeDelay").then((m) => m.TapeDelay),
  { ssr: false }
);

export default function TapeDelayPage() {
  return (
    <>
      <Head>
        <title>Tape Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <TapeDelay />
      </div>
    </>
  );
}
