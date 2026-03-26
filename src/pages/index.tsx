import Head from "next/head";
import Link from "next/link";

const EXPERIMENTS = [
  {
    href: "/glissando",
    title: "Shepard-Risset Glissando",
    description:
      "Auditory illusion of an endlessly rising or falling tone, built from phase-offset sine oscillators with bell-curve envelopes.",
    tag: "synthesis",
  },
  {
    href: "/shepard-delay-global-feedback",
    title: "Shepard Delay — Global Feedback",
    description:
      "Variant of the Shepard Delay with a global feedback loop — the mixed output feeds back into the delay network for denser, more chaotic textures.",
    tag: "effect",
  },
  {
    href: "/simple-tape-delay",
    title: "Simple Tape Delay",
    description:
      "One circular buffer, one read head, one feedback path — the fundamental building block of all the other delay experiments.",
    tag: "effect",
  },
  {
    href: "/tape-delay",
    title: "Multi-Head Tape Delay",
    description:
      "Circular buffer modelled as infinite tape — a record head writes continuously while a movable play head reads back at a variable delay, with feedback.",
    tag: "effect",
  },
  {
    href: "/candy-coil-delay",
    title: "Candy Coil Delay",
    description:
      "A variation on the Risset Tape Delay — same spiraling architecture, new flavor.",
    tag: "effect",
  },
  {
    href: "/risset-coil-delay",
    title: "Risset Coil Delay",
    description:
      "Tuned for the classic Shepard-Risset illusion — feed it a steady tone and the echoes endlessly rise or fall.",
    tag: "effect",
  },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>morphisma</title>
        <meta name="description" content="WebGPU Audio Experiments" />
      </Head>
      <div className="page-wide">
        <h1 className="site-title">morphisma</h1>
        <h2 className="subtitle">Audio &amp; Visual Experiments</h2>

        <div className="experiment-grid">
          {EXPERIMENTS.map((exp) => (
            <Link key={exp.href} href={exp.href} className="experiment-card">
              <h3>{exp.title}</h3>
              <p>{exp.description}</p>
              <span className="tag">{exp.tag}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
