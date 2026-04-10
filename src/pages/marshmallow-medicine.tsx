import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const MarshmallowMedicine = dynamic(
  () =>
    import("@/components/experiments/MarshmallowMedicine").then(
      (m) => m.MarshmallowMedicine
    ),
  { ssr: false }
);

export default function MarshmallowMedicinePage() {
  return (
    <>
      <Head>
        <title>Marshmallow Medicine — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link" style={{ color: "#dd88cc" }}>
          ← morphisma
        </Link>
        <MarshmallowMedicine />
      </div>
    </>
  );
}
