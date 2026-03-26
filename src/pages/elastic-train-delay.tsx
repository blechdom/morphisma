import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const ElasticTrainDelay = dynamic(
  () =>
    import("@/components/experiments/ElasticTrainDelay").then(
      (m) => m.ElasticTrainDelay
    ),
  { ssr: false }
);

export default function ElasticTrainDelayPage() {
  return (
    <>
      <Head>
        <title>Elastic Train Delay — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <ElasticTrainDelay />
      </div>
    </>
  );
}
