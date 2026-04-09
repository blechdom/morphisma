import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const StripedSludgeDelay = dynamic(
  () =>
    import("@/components/experiments/StripedSludgeDelay").then(
      (m) => m.StripedSludgeDelay
    ),
  { ssr: false }
);

export default function StripedSludgeDelayPage() {
  return (
    <>
      <Head>
        <title>Striped Sludge Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link" style={{ color: "#8ca030" }}>
          ← morphisma
        </Link>
        <StripedSludgeDelay />
      </div>
    </>
  );
}
