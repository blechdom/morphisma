import Head from "next/head";
import Link from "next/link";

const CANDY_BG = `repeating-linear-gradient(45deg, rgba(220,60,80,0.12) 0px, rgba(220,60,80,0.12) 10px, rgba(255,255,255,0.07) 10px, rgba(255,255,255,0.07) 20px, rgba(200,255,0,0.1) 20px, rgba(200,255,0,0.1) 24px, rgba(230,80,160,0.12) 24px, rgba(230,80,160,0.12) 34px, rgba(140,50,160,0.12) 34px, rgba(140,50,160,0.12) 44px)`;

const ELASTIC_BG = `repeating-linear-gradient(-45deg, rgba(80,170,220,0.12) 0px, rgba(80,170,220,0.12) 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px, rgba(255,50,120,0.12) 20px, rgba(255,50,120,0.12) 24px, rgba(50,180,120,0.12) 24px, rgba(50,180,120,0.12) 34px, rgba(60,40,140,0.12) 34px, rgba(60,40,140,0.12) 44px)`;

const EXPERIMENTS = [
  {
    href: "/glissando",
    title: "Shepard-Risset Glissando",
    description:
      "Auditory illusion of an endlessly rising or falling tone, built from phase-offset sine oscillators with bell-curve envelopes.",
    tag: "synthesis",
    background: undefined as string | undefined,
  },
  {
    href: "/shepard-delay-global-feedback",
    title: "Shepard Delay — Global Feedback",
    description:
      "Variant of the Shepard Delay with a global feedback loop — the mixed output feeds back into the delay network for denser, more chaotic textures.",
    tag: "effect",
    background: undefined as string | undefined,
  },
  {
    href: "/simple-tape-delay",
    title: "Simple Tape Delay",
    description:
      "One circular buffer, one read head, one feedback path — the fundamental building block of all the other delay experiments.",
    tag: "effect",
    background: undefined as string | undefined,
  },
  {
    href: "/tape-delay",
    title: "Multi-Head Tape Delay",
    description:
      "Circular buffer modelled as infinite tape — a record head writes continuously while a movable play head reads back at a variable delay, with feedback.",
    tag: "effect",
    background: undefined as string | undefined,
  },
  {
    href: "/candy-coil-delay",
    title: "Candy Coil Delay",
    description:
      "A variation on the Risset Tape Delay — same spiraling architecture, new flavor.",
    tag: "effect",
    background: CANDY_BG,
  },
  {
    href: "/elastic-train-delay",
    title: "Elastic Train Delay",
    description:
      "Voices sweep an exponential arc through a deep buffer — starting seconds behind the record head and accelerating toward the present, creating an endless Shepard pitch illusion.",
    tag: "effect",
    background: ELASTIC_BG,
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
        <h2 className="subtitle">Audio Experiments</h2>

        <div className="experiment-grid">
          {EXPERIMENTS.map((exp) => (
            <Link key={exp.href} href={exp.href} className="experiment-card" style={exp.background ? { backgroundImage: exp.background } : undefined}>
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
