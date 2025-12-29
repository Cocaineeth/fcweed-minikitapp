"use client";

import { Providers } from "./providers";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import FCWeedApp from "./FCWeedApp";

export default function Page() {
  return (
    <Providers>
      <SafeArea>
        <FCWeedApp />
      </SafeArea>
    </Providers>
  );
}
