import Head from "next/head";
import Link from "next/link";

const GLISSANDO_BG = `repeating-linear-gradient(45deg, rgba(200,30,30,0.3) 0px, rgba(200,30,30,0.3) 10px, rgba(255,255,255,0.18) 10px, rgba(255,255,255,0.18) 20px, rgba(180,20,20,0.25) 20px, rgba(180,20,20,0.25) 24px, rgba(255,240,240,0.18) 24px, rgba(255,240,240,0.18) 34px, rgba(220,50,50,0.3) 34px, rgba(220,50,50,0.3) 44px)`;

const CANDY_BG = `repeating-linear-gradient(45deg, rgba(220,60,80,0.3) 0px, rgba(220,60,80,0.3) 10px, rgba(255,255,255,0.18) 10px, rgba(255,255,255,0.18) 20px, rgba(200,255,0,0.25) 20px, rgba(200,255,0,0.25) 24px, rgba(230,80,160,0.3) 24px, rgba(230,80,160,0.3) 34px, rgba(140,50,160,0.3) 34px, rgba(140,50,160,0.3) 44px)`;

const SLUDGE_BG = `repeating-linear-gradient(-45deg, rgba(80,100,40,0.3) 0px, rgba(80,100,40,0.3) 10px, rgba(20,15,10,0.25) 10px, rgba(20,15,10,0.25) 20px, rgba(160,120,40,0.3) 20px, rgba(160,120,40,0.3) 24px, rgba(60,80,50,0.25) 24px, rgba(60,80,50,0.25) 34px, rgba(90,60,30,0.3) 34px, rgba(90,60,30,0.3) 44px)`;

const SANDY_BG = `repeating-linear-gradient(45deg, rgba(40,180,130,0.3) 0px, rgba(40,180,130,0.3) 10px, rgba(20,10,40,0.25) 10px, rgba(20,10,40,0.25) 20px, rgba(0,220,200,0.3) 20px, rgba(0,220,200,0.3) 24px, rgba(110,60,180,0.25) 24px, rgba(110,60,180,0.25) 34px, rgba(30,140,130,0.3) 34px, rgba(30,140,130,0.3) 44px)`;

const BIPOLAR_BG = `repeating-linear-gradient(-45deg, rgba(80,20,140,0.3) 0px, rgba(80,20,140,0.3) 10px, rgba(15,10,25,0.25) 10px, rgba(15,10,25,0.25) 20px, rgba(255,50,200,0.3) 20px, rgba(255,50,200,0.3) 24px, rgba(60,20,100,0.25) 24px, rgba(60,20,100,0.25) 34px, rgba(120,40,180,0.3) 34px, rgba(120,40,180,0.3) 44px)`;

const MARSHMALLOW_BG = `repeating-linear-gradient(45deg, rgba(255,180,210,0.3) 0px, rgba(255,180,210,0.3) 10px, rgba(200,170,255,0.2) 10px, rgba(200,170,255,0.2) 20px, rgba(255,255,255,0.25) 20px, rgba(255,255,255,0.25) 24px, rgba(170,230,200,0.2) 24px, rgba(170,230,200,0.2) 34px, rgba(240,160,190,0.3) 34px, rgba(240,160,190,0.3) 44px)`;

const SLIPPERY_BG = `repeating-linear-gradient(135deg, rgba(48,204,170,0.3) 0px, rgba(48,204,170,0.3) 8px, rgba(20,60,50,0.25) 8px, rgba(20,60,50,0.25) 16px, rgba(100,255,200,0.2) 16px, rgba(100,255,200,0.2) 20px, rgba(30,120,100,0.3) 20px, rgba(30,120,100,0.3) 28px, rgba(60,200,160,0.25) 28px, rgba(60,200,160,0.25) 36px)`;

const EXPERIMENTS = [
  {
    href: "/glissando",
    title: "Shepard-Risset Glissando",
    description:
      "Auditory illusion of an endlessly rising or falling tone, built from phase-offset sine oscillators with bell-curve envelopes.",
    tag: "synthesis",
    background: GLISSANDO_BG,
    titleColor: "#ff4444",
  },
  {
    href: "/candy-coil-delay",
    title: "Candy Coil Delay",
    description:
      "A variation on the Risset Tape Delay — same spiraling architecture, new flavor.",
    tag: "effect",
    background: CANDY_BG,
    titleColor: "#e05090",
  },
  {
    href: "/striped-sludge-delay",
    title: "Striped Sludge Delay",
    description:
      "Candy Coil variant with a centered delay hump — voices sweep below and above the original pitch, creating a true Shepard spiral through the source frequency.",
    tag: "effect",
    background: SLUDGE_BG,
    titleColor: "#8ca030",
  },
  {
    href: "/sandy-syrup-delay",
    title: "Sandy Syrup Delay",
    description:
      "Overlap-add granular pitch-shifting delay — each grain locks a playback rate from slow to fast. Sand = each grain locks its rate at grain start. Syrup = rate follows the live control ramp within each grain. Blend interpolates between the two.",
    tag: "effect",
    background: SANDY_BG,
    titleColor: "#20ccaa",
  },
  {
    href: "/bipolar-breakdown-delay",
    title: "Bipolar Breakdown Delay",
    description:
      "WORK-IN-PROGRESS — A play head loops from a fixed anchor to the record head — each pass covers more buffer in the same time, accelerating until it breaks down.",
    tag: "effect",
    background: BIPOLAR_BG,
    titleColor: "#cc88dd",
  },
  {
    href: "/slippery-spectrum",
    title: "Slippery Spectrum",
    description:
      "WORK-IN-PROGRESS — FFT analysis splits the input into frequency bands — each band resynthesized as a Shepard-Risset glissando, creating an endlessly rising or falling spectral ghost of the original signal.",
    tag: "effect",
    background: SLIPPERY_BG,
    titleColor: "#30ccaa",
  },
  {
    href: "/marshmallow-medicine",
    title: "Marshmallow Medicine",
    description:
      "WORK-IN-PROGRESS — A laboratory for Shepard / Risset LFOs: modulation signals that appear to rise or fall forever. Five strategies for infinite FM, PM, and AM.",
    tag: "synthesis",
    background: MARSHMALLOW_BG,
    titleColor: "#dd88cc",
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
              <h3 style={exp.titleColor ? { color: exp.titleColor } : undefined}>{exp.title}</h3>
              <p>{exp.description}</p>
              <span className="tag">{exp.tag}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
