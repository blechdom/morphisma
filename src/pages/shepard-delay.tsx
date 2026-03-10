import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const ShepardDelay = dynamic(
  () =>
    import("@/components/experiments/ShepardDelay").then(
      (m) => m.ShepardDelay
    ),
  { ssr: false }
);

export default function ShepardDelayPage() {
  return (
    <>
      <Head>
        <title>Shepard Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <ShepardDelay />
      </div>
    </>
  );
}
