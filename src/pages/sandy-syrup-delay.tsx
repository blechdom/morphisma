import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const SandySyrupDelay = dynamic(
  () =>
    import("@/components/experiments/SandySyrupDelay").then(
      (m) => m.SandySyrupDelay
    ),
  { ssr: false }
);

export default function SandySyrupDelayPage() {
  return (
    <>
      <Head>
        <title>Sandy Syrup Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link" style={{ color: "#20ccaa" }}>
          ← morphisma
        </Link>
        <SandySyrupDelay />
      </div>
    </>
  );
}
