"use client";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const tokenInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (value && tokenInput.current) tokenInput.current.value = value;
    // Fragment credentials never enter HTTP access logs; clear browser history immediately.
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  return (
    <form action="/api/auth/login" method="post" className="mt-7 space-y-4">
      <div>
        <label htmlFor="token" className="mb-2 block text-xs font-medium">
          One-time access token
        </label>
        <Input
          ref={tokenInput}
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          required
          pattern="[a-f0-9]{64}"
          minLength={64}
          maxLength={64}
          placeholder="Paste the token from your local sign-in link"
        />
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Links expire after 15 minutes and work once.
        </p>
      </div>
      <Button type="submit" className="w-full">
        Open your workspace <ArrowRight />
      </Button>
    </form>
  );
}
