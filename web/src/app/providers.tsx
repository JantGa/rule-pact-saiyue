"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { http, createConfig, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "wagmi/chains";

const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: http(
      process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"
    )
  }
});

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false }
        }
      })
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

