import type { AppProps } from "next/app";
import { Savate, Londrina_Shadow } from "next/font/google";
import "@/styles/globals.css";

const savate = Savate({ subsets: ["latin"], weight: ["200", "300", "400"] });
const londrinaShadow = Londrina_Shadow({ subsets: ["latin"], weight: "400" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        .site-title {
          font-family: ${londrinaShadow.style.fontFamily}, cursive;
          color: #7d6091;
        }
        .subtitle {
          font-family: ${savate.style.fontFamily}, sans-serif;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
