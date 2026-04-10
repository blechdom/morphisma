import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const SlipperySpectrum = dynamic(
  () =>
    import("@/components/experiments/SlipperySpectrum").then(
      (m) => m.SlipperySpectrum
    ),
  { ssr: false }
);

export default function SlipperySpectrumPage() {
  return (
    <>
      <Head>
        <title>Slippery Spectrum — MORPHISMA</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← morphisma
        </Link>
        <SlipperySpectrum />
      </div>
    </>
  );
}
