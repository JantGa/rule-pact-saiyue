import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { WalletButton } from "./wallet-button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="Rule pact 赛约首页">
          <span className="brand-mark">
            <span>R</span>
          </span>
          <span className="brand-word">
            Rule pact <small>赛约</small>
          </span>
        </Link>
        <nav className="header-nav" aria-label="主要导航">
          <a href="/#how-it-works">裁判机制</a>
          <a href="/#why-monad">链上公证</a>
          <Link href="/">
            工作台 <ArrowUpRight size={13} style={{ verticalAlign: -2 }} />
          </Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}

